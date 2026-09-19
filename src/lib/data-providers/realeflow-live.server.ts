// ---------------------------------------------------------------------------
// Live per-user RealeFlow pull — the launch data model (Tyler, 2026-09-16).
//
// RealeFlow's license forbids serving one account's results to other users
// (no pooling / caching / redistribution). The compliant model is therefore
// ON-DEMAND: when an operator asks for a county, the rows are fetched from
// the Partner API at that moment, under THAT user's own RealElite account,
// and land only in their job's leads — never in the shared warehouse.
//
// Account routing:
//   - accountIdForUser(userId) resolves the caller's own RealElite account.
//   - It returns null while the super-admin "per-user accounts" flag is OFF
//     or the user has no mapping — every request then falls back to the env
//     test account (192423), which is the approved testing-period model for
//     the internal team. Flipping the flag in Platform → Overview activates
//     per-user routing with NO further code changes.
//
// Geography: any US county is addressable. Roster counties resolve statically;
// everything else resolves through the Partner /autocomplete endpoint, so the
// reach is RealeFlow's own national dataset — no pre-pulled roster required.
// ---------------------------------------------------------------------------

import type { RawLead } from "./index";
import {
  REALEFLOW_LEAD_CONFIGS,
  REALEFLOW_PAGE_SIZE,
  buildSearchBody,
  isMailingOptedOut,
  propertyToFiling,
  type RealeflowLeadConfig,
} from "./realeflow-source.shared";
import { rosterEntriesFor, type RosterEntry } from "../us-counties";
import { storedSlugsForRecordType } from "../record-types";
import { splitCountyLabel } from "../coverage.shared";

const POLITE_DELAY_MS = 1_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Enabled RealeFlow configs that serve this record-type spelling. */
export function liveConfigsForRecordType(recordType: string): RealeflowLeadConfig[] {
  const slugs = new Set(storedSlugsForRecordType(recordType));
  return REALEFLOW_LEAD_CONFIGS.filter((c) => c.enabled && slugs.has(c.recordType));
}

/** Can this record type be served live from RealeFlow at all? */
export function isLiveServable(recordType: string): boolean {
  return liveConfigsForRecordType(recordType).length > 0;
}

/**
 * Resolve a county label to {state, county, fips}. Roster entries win (static,
 * no network); any other "County, ST" label resolves through the Partner
 * /autocomplete endpoint — which is what makes the reach nationwide. Bare
 * names outside the roster are ambiguous across states and return null.
 */
export async function resolveCountyLive(label: string): Promise<RosterEntry | null> {
  const rosterHit = rosterEntriesFor([label])[0];
  if (rosterHit) return rosterHit;

  const { county, state } = splitCountyLabel(label);
  if (!county || !state) return null;

  const { rfAutocomplete } = await import("../realeflow/client.server");
  const results = await rfAutocomplete(`${county} County, ${state}`);
  for (const r of results) {
    if (r.type !== "county") continue;
    const c = r.county;
    if ((c.state ?? "").toUpperCase() !== state) continue;
    const cleanName = String(c.county ?? "").replace(/\s+county$/i, "").trim();
    if (!cleanName.toLowerCase().startsWith(county.toLowerCase().slice(0, 4))) continue;
    const fips = String(c.fips ?? "").padStart(5, "0");
    if (!/^\d{5}$/.test(fips)) continue;
    return { state, county: cleanName, fips };
  }
  return null;
}

function filingToLead(
  f: NonNullable<ReturnType<typeof propertyToFiling>>,
  entry: RosterEntry,
  config: RealeflowLeadConfig,
): RawLead {
  return {
    full_name: [f.owner_first, f.owner_last].filter(Boolean).join(" ") || null,
    business_name: f.company_entity,
    phone: null,
    email: null,
    address: f.property_address,
    city: f.property_city,
    state: f.property_state ?? entry.state,
    zip: f.property_zip,
    source_meta: {
      // User-scoped by license: written only to this job's leads, NEVER pooled
      // into distress_records (that would redistribute one account's results).
      source: "realeflow_live",
      record_type: config.recordType,
      doc_number: f.doc_number,
      county: entry.county,
      fips: entry.fips,
      amount: f.amount,
      parcel_apn: f.parcel_apn,
    },
  } as RawLead;
}

export type LivePullResult = {
  /** False when the county label could not be resolved to a US county. */
  resolved: boolean;
  /**
   * True when the pull ran under the caller's OWN RealElite account (per-user
   * flag ON + mapping exists). License: account-scoped results must never be
   * backfilled from the pooled warehouse — callers use this to gate fallbacks.
   */
  accountScoped: boolean;
  leads: RawLead[];
};

/**
 * Pull one county's record types live from RealeFlow, under the requesting
 * user's own account when per-user routing is active (env test account
 * otherwise). Entitlement/API failures on one type never sink the others.
 */
export async function liveRealeflowPull(args: {
  countyLabel: string;
  recordTypes: string[];
  /** The list creator — resolves to their RealElite account at launch. */
  actorUserId?: string | null;
  /** Rows per record type (default 100, hard cap 200). */
  limitPerType?: number;
  onProgress?: (message: string, count?: number) => Promise<void> | void;
}): Promise<LivePullResult> {
  const entry = await resolveCountyLive(args.countyLabel);
  if (!entry) return { resolved: false, accountScoped: false, leads: [] };

  const seen = new Set<string>();
  const configs: RealeflowLeadConfig[] = [];
  for (const rt of args.recordTypes) {
    for (const c of liveConfigsForRecordType(rt)) {
      if (!seen.has(c.recordType)) {
        seen.add(c.recordType);
        configs.push(c);
      }
    }
  }
  // Per-user account routing. Null (flag OFF / no mapping) → env test account.
  let accountId: string | undefined;
  if (args.actorUserId) {
    const { accountIdForUser } = await import("../realeflow/accounts.server");
    accountId = (await accountIdForUser(args.actorUserId)) ?? undefined;
  }
  const accountScoped = Boolean(accountId);

  if (!configs.length) return { resolved: true, accountScoped, leads: [] };

  const { rfSearch } = await import("../realeflow/client.server");
  const { splitOwner } = await import("../distress-feed.server");

  const limit = Math.min(Math.max(args.limitPerType ?? 100, 1), 200);
  const leads: RawLead[] = [];

  for (const config of configs) {
    try {
      const filings: Array<NonNullable<ReturnType<typeof propertyToFiling>>> = [];
      for (let page = 1; filings.length < limit; page += 1) {
        const body = buildSearchBody({
          fips: entry.fips,
          state: entry.state,
          config,
          page,
          pageSize: Math.min(REALEFLOW_PAGE_SIZE, limit - filings.length),
        });
        const res = await rfSearch(body, accountId ? { accountId } : {});
        const rows = res.data ?? [];
        for (const property of rows) {
          if (isMailingOptedOut(property)) continue;
          const filing = propertyToFiling(config, entry.county, property, splitOwner);
          if (filing) filings.push(filing);
        }
        if (rows.length < (body.page_size ?? REALEFLOW_PAGE_SIZE)) break;
        await sleep(POLITE_DELAY_MS);
      }
      if (filings.length) {
        await args.onProgress?.(
          `Pulled ${filings.length} ${config.label} records live for ${entry.county}, ${entry.state}.`,
          filings.length,
        );
      }
      for (const f of filings) leads.push(filingToLead(f, entry, config));
    } catch (err) {
      // One refused/broken type must not sink the county's other types.
      console.error(
        `[realeflow-live] ${config.recordType} for ${entry.county}, ${entry.state} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { resolved: true, accountScoped, leads };
}
