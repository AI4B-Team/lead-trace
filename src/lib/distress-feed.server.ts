/**
 * Distress Feed — server-only data layer.
 *
 * Reads for the public marketing pages go through SECURITY DEFINER helpers that
 * return aggregates or surname-masked rows only, so an unauthenticated visitor
 * can never pull the raw feed. Writes happen from the nightly pull and from
 * parsed public-records-request responses, and every attempt is logged to
 * distress_pulls so each county page can state its real last-pull date.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { countyKey, RECORD_TYPES, type DistressRecordType } from "./distress-feed.shared";
import {
  deriveSurplus, surplusEnabledFor, EMPTY_SURPLUS_COUNTERS,
  type SurplusBasis, type SurplusCounters,
} from "./distress/surplus";

/** Publishable-key client: public reads only, no session persistence. */
export function publicClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  // The distress_* helpers are no longer callable by anon or authenticated:
  // they run only from trusted server code so a visitor cannot invoke them
  // directly against the Data API.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = supabaseAdmin;
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type FeedTotals = {
  total_records: number;
  counties: number;
  states: number;
  added_this_week: number;
  last_pull_at: string | null;
};

export type StateSummary = {
  state: string;
  counties: number;
  total_records: number;
  new_this_week: number;
  last_pull_at: string | null;
};

export type CountySummary = {
  county: string;
  fips: string | null;
  total_records: number;
  new_this_week: number;
  record_types: string[];
  last_pull_at: string | null;
};

export type PreviewRow = {
  record_type: string;
  filed_date: string | null;
  owner_masked: string;
  property_city: string | null;
  property_zip: string | null;
  amount: number | null;
  status: string | null;
};

export async function feedTotals(): Promise<FeedTotals> {
  const rows = await rpc<FeedTotals[]>("distress_feed_totals");
  return (
    rows?.[0] ?? { total_records: 0, counties: 0, states: 0, added_this_week: 0, last_pull_at: null }
  );
}

export async function stateSummaries(): Promise<StateSummary[]> {
  return (await rpc<StateSummary[]>("distress_state_summary")) ?? [];
}

export async function countySummaries(state: string): Promise<CountySummary[]> {
  return (await rpc<CountySummary[]>("distress_county_summary", { _state: state })) ?? [];
}

export async function countyPreview(state: string, county: string, limit = 10): Promise<PreviewRow[]> {
  return (
    (await rpc<PreviewRow[]>("distress_county_preview", {
      _state: state,
      _county: county,
      _limit: limit,
    })) ?? []
  );
}

export async function topCounties(limit = 20) {
  return (await rpc<Array<{ state: string; county: string; total_records: number }>>(
    "distress_top_counties",
    { _limit: limit },
  )) ?? [];
}

export type SurplusPreviewRow = {
  doc_number: string;
  auction_date: string | null;
  surplus_amount: number | null;
  surplus_basis: string | null;
  sold_to: string | null;
  estimated: boolean;
  owner_masked: string;
  property_city: string | null;
  property_zip: string | null;
  /** Clerk-confirmed fields. Null until a confirmation matches this record. */
  confirmed_amount: number | null;
  confirmed_as_of: string | null;
  claim_deadline: string | null;
  deadline_from_clerk: boolean | null;
  claim_status: string | null;
  variance_pct: number | null;
  confirmation_source_url: string | null;
  source_status: string | null;
  source_consecutive_failures: number | null;
};

/**
 * Masked surplus rows for a county. The auction-derived amount is always
 * present and flagged estimated; the clerk's confirmed amount rides alongside
 * it when a confirmation matched, so the two are never conflated.
 */
export async function surplusPreview(
  state: string,
  county: string,
  limit = 6,
): Promise<SurplusPreviewRow[]> {
  return (
    (await rpc<SurplusPreviewRow[]>("distress_surplus_preview", {
      _state: state,
      _county: county,
      _limit: limit,
    })) ?? []
  );
}

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

export type GuideRow = {
  fips: string;
  state: string;
  county: string;
  record_type: string;
  title: string | null;
  portal_url: string;
  intro: string | null;
  steps: Array<{ heading?: string; body: string }>;
  fields: string[];
  notes: string | null;
  updated_at: string;
};

export async function listGuides(state?: string): Promise<GuideRow[]> {
  const supabase = publicClient();
  let q = supabase
    .from("distress_guides")
    .select("fips, state, county, record_type, title, portal_url, intro, steps, fields, notes, updated_at")
    .eq("published", true)
    .order("state")
    .order("county");
  if (state) q = q.ilike("state", state);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GuideRow[];
}

export async function getGuide(state: string, county: string, recordType: string): Promise<GuideRow | null> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("distress_guides")
    .select("fips, state, county, record_type, title, portal_url, intro, steps, fields, notes, updated_at")
    .ilike("state", state)
    .ilike("county", county)
    .eq("record_type", recordType)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as GuideRow) ?? null;
}

// ---------------------------------------------------------------------------
// Nightly pull
// ---------------------------------------------------------------------------

export type RawFiling = {
  doc_number: string;
  filed_date?: string | null;
  owner_first?: string | null;
  owner_last?: string | null;
  company_entity?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_zip?: string | null;
  amount?: number | null;
  auction_date?: string | null;
  status?: string | null;
  parcel_apn?: string | null;
  source_url?: string | null;
  raw?: Record<string, unknown>;
  /** Surplus Funds only — computed from auction results, never estimated. */
  surplus_amount?: number | null;
  surplus_basis?: string | null;
  sold_to?: string | null;
  estimated?: boolean;
};

export type PullTarget = {
  state: string;
  county: string;
  recordType: DistressRecordType;
  /** Where the filings come from. `records_request` targets are ingested by the
   * records-request parser instead of being fetched here. */
  path: "portal" | "open_data" | "records_request";
  portalUrl?: string;
  /** Minimum minutes between pulls for this source (data_sources.crawl_interval_minutes). */
  intervalMinutes?: number;
  /** Vendor requiring the residential proxy (RealForeclose / RealTaxDeed). */
  proxied?: boolean;
  pull?: () => Promise<RawFiling[]>;
};

/** Split "SMITH, JOHN A" or "John Smith" into first/last without guessing hard. */
export function splitOwner(name: string): { first: string | null; last: string | null; entity: string | null } {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value) return { first: null, last: null, entity: null };
  if (/\b(LLC|INC|TRUST|CORP|LP|LTD|COMPANY|ASSOC|BANK|FOUNDATION)\b/i.test(value)) {
    return { first: null, last: null, entity: value };
  }
  if (value.includes(",")) {
    const [last, rest] = value.split(",");
    return { first: (rest ?? "").trim().split(" ")[0] || null, last: last.trim() || null, entity: null };
  }
  const parts = value.split(" ");
  if (parts.length === 1) return { first: null, last: parts[0], entity: null };
  return { first: parts[0], last: parts[parts.length - 1], entity: null };
}

/**
 * Hillsborough County tax deed sales, published by the clerk on RealAuction.
 * The calendar endpoint returns the auction days; each day returns its items.
 * Parsed defensively — a layout change must degrade to "0 found, error logged",
 * never to bad rows in a shared table.
 */
async function pullHillsboroughTaxDeed(): Promise<RawFiling[]> {
  const base = "https://hillsborough.realtaxdeed.com";
  // Must go through the shared polite path: this vendor only answers a
  // residential proxy IP with a browser User-Agent.
  const { politeHtml } = await import("./data-providers/scraper-policy");
  const { html } = await politeHtml(`${base}/index.cfm?zaction=AUCTION&Zmethod=UPCOMING`);

  const filings: RawFiling[] = [];
  const blocks = html.split(/class="AUCTION_ITEM/).slice(1);
  for (const block of blocks) {
    const field = (label: string) => {
      const re = new RegExp(`${label}[^<]*<[^>]*>\\s*([^<]+)`, "i");
      return block.match(re)?.[1]?.trim() ?? null;
    };
    const doc = field("Case #") ?? field("Tax Deed");
    if (!doc) continue;
    const owner = field("Property Owner") ?? "";
    const { first, last, entity } = splitOwner(owner);
    const amountText = field("Opening Bid")?.replace(/[^0-9.]/g, "");
    filings.push({
      doc_number: doc,
      filed_date: null,
      owner_first: first,
      owner_last: last,
      company_entity: entity,
      property_address: field("Property Address"),
      property_city: field("City"),
      property_state: "FL",
      property_zip: field("Zip"),
      amount: amountText ? Number(amountText) : null,
      auction_date: field("Auction Date"),
      status: field("Auction Status") ?? "scheduled",
      parcel_apn: field("Parcel ID"),
      source_url: base,
      raw: { source: "realtaxdeed", county: "Hillsborough" },
    });
  }
  return filings;
}

/**
 * Generic RealTaxDeed pull for any county the discovery script verified.
 * Walks the county's auction calendar and ingests every future sale day.
 * Uses the shared adapter, so a markup change degrades to a logged error.
 */
async function pullRealtaxdeedCounty(sub: string, county: string): Promise<RawFiling[]> {
  const { fetchRealauctionDay, parseCalendarDates, realauctionUrls, isUsableRow } = await import(
    "./data-providers/realauction"
  );
  const { politeHtml, auctionWindowBlock } = await import("./data-providers/scraper-policy");
  const block = auctionWindowBlock();
  if (block.blocked) throw new Error(block.reason);

  const calUrl = realauctionUrls.calendar(sub, "realtaxdeed.com");
  const { html } = await politeHtml(calUrl);
  const future = parseCalendarDates(html)
    .filter((d) => +new Date(d) >= Date.now() - 86_400_000)
    .sort((a, b) => +new Date(a) - +new Date(b))
    .slice(0, 5);

  const filings: RawFiling[] = [];
  let structureFailures = 0;
  let lastStructureError: Error | null = null;
  for (const date of future) {
    try {
      const rows = await fetchRealauctionDay(sub, date, undefined, "realtaxdeed.com");
      for (const row of rows.filter(isUsableRow)) {
        // "Property Owner" is not in the adapter's labelMap, so it lands in
        // raw under its lowercased label.
        const owner = row.raw["property owner"] ?? row.raw["propertyOwner"] ?? "";
        const { first, last, entity } = splitOwner(owner);
        filings.push({
          doc_number: row.caseNumber ?? row.auctionItemId ?? "",
          filed_date: null,
          owner_first: first,
          owner_last: last,
          company_entity: entity,
          property_address: row.propertyAddress,
          property_city: row.propertyCity,
          property_state: "FL",
          property_zip: row.propertyZip,
          amount: row.openingBid ?? row.finalJudgmentAmount,
          auction_date: row.auctionDate,
          status: "scheduled",
          parcel_apn: row.parcelApn,
          source_url: row.sourceUrl,
          raw: { source: "realtaxdeed", county, ...row.raw },
        });
      }
    } catch (err) {
      // An empty or cancelled day is normal. A single day's structural failure
      // is tolerated (cancelled days often render oddly), but if EVERY probed
      // day fails structurally the source has changed and we must fail loudly
      // rather than record a silent zero-row night.
      const name = err instanceof Error ? err.name : "";
      if (name === "AdapterEmptyDayError") continue;
      if (name === "AdapterStructureError") {
        structureFailures += 1;
        lastStructureError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      throw err;
    }
  }
  if (filings.length === 0 && structureFailures > 0 && structureFailures === future.length) {
    throw lastStructureError ?? new Error(`${county}: every auction day failed to parse`);
  }
  return filings.filter((f) => f.doc_number);
}

/**
 * Pull targets sourced from verified coverage rows the discovery scripts
 * wrote. One row per county on <county>.realtaxdeed.com; anything not
 * verified never runs (coverage gate holds here too).
 */
async function dynamicRealtaxdeedTargets(): Promise<PullTarget[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("data_sources")
    .select("domain, county_name, state, crawl_interval_minutes")
    .eq("dataset_id", "realtaxdeed_auction_calendar")
    .eq("status", "verified");
  return (data ?? [])
    .filter((r) => r.county_name && r.domain)
    .map((r) => {
      const sub = String(r.domain).split(".")[0]!;
      const county = String(r.county_name);
      return {
        state: String(r.state ?? "FL"),
        county,
        recordType: "tax_deed" as DistressRecordType,
        path: "portal" as const,
        portalUrl: `https://${r.domain}`,
        intervalMinutes: Number(r.crawl_interval_minutes ?? 1440),
        proxied: true,
        pull: () => pullRealtaxdeedCounty(sub, county),
      };
    });
}

/**
 * Catalogued open-data sources (Socrata / ArcGIS) the discovery scripts
 * verified. The stored field_map is what runs, and each row's own
 * crawl_interval_minutes decides whether it is due tonight. Nothing that is
 * not `verified` is ever fetched.
 */
async function dynamicCatalogTargets(): Promise<PullTarget[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("data_sources")
    .select(
      "id, platform, domain, dataset_id, resource_url, county_name, state, record_type, field_map, crawl_interval_minutes",
    )
    .eq("status", "verified")
    .in("platform", ["socrata", "arcgis"]);

  const targets: PullTarget[] = [];
  for (const row of data ?? []) {
    const county = String(row.county_name ?? "");
    const state = String(row.state ?? "");
    const recordType = String(row.record_type ?? "") as DistressRecordType;
    if (!county || !state || !recordType) continue;
    targets.push({
      state,
      county,
      recordType,
      path: "open_data",
      portalUrl: row.resource_url ?? `https://${row.domain}`,
      intervalMinutes: Number(row.crawl_interval_minutes ?? 1440),
      pull: async () => {
        const fieldMap = (row.field_map ?? {}) as import("./data-providers/source-mapping").FieldMap;
        let rows: import("./data-providers").RawLead[] = [];
        if (row.platform === "socrata" && row.dataset_id) {
          const { fetchSocrataRows } = await import("./data-providers/socrata");
          rows = await fetchSocrataRows({
            domain: String(row.domain),
            datasetId: String(row.dataset_id),
            fieldMap,
            recordType,
            county,
            state,
            dateFrom: null,
            dateTo: null,
            limit: 200,
            offset: 0,
          });
        } else if (row.platform === "arcgis") {
          const layerUrl =
            row.resource_url ?? `https://${row.domain}/arcgis/rest/services/${row.dataset_id}`;
          const { fetchArcgisRows } = await import("./data-providers/arcgis");
          rows = await fetchArcgisRows({
            layerUrl: String(layerUrl),
            fieldMap,
            recordType,
            county,
            state,
            dateFrom: null,
            dateTo: null,
            limit: 200,
            offset: 0,
          });
        }
        return rows.map(catalogRowToFiling(state, county));
      },
    });
  }
  return targets;
}

/** Map a normalized open-data row onto the feed's filing shape. */
function catalogRowToFiling(state: string, county: string) {
  return (lead: import("./data-providers").RawLead): RawFiling => {
    const meta = (lead.source_meta ?? {}) as Record<string, unknown>;
    const owner = lead.full_name ?? "";
    const { first, last, entity } = splitOwner(owner);
    const caseId = meta["case_id"] ? String(meta["case_id"]) : "";
    return {
      doc_number: caseId || `${(lead.address ?? "").toUpperCase()}|${String(meta["case_date"] ?? "")}`,
      filed_date: meta["case_date"] ? String(meta["case_date"]) : null,
      owner_first: first,
      owner_last: last,
      company_entity: entity,
      property_address: lead.address ?? null,
      property_city: lead.city ?? null,
      property_state: lead.state ?? state.toUpperCase(),
      property_zip: lead.zip ?? null,
      amount: null,
      auction_date: null,
      status: meta["gov_status"] ? String(meta["gov_status"]) : null,
      parcel_apn: null,
      source_url: meta["source_url"] ? String(meta["source_url"]) : null,
      raw: { ...meta, county },
    };
  };
}

export const PULL_TARGETS: PullTarget[] = [
  {
    state: "FL",
    county: "Hillsborough",
    recordType: "tax_deed",
    path: "portal",
    portalUrl: "https://hillsborough.realtaxdeed.com",
    proxied: true,
    pull: pullHillsboroughTaxDeed,
  },
  {
    // Hillsborough probate is not published as a machine-readable dataset, so it
    // arrives through the standing public-records request to the clerk and is
    // ingested by the records-request parser into this same table.
    state: "FL",
    county: "Hillsborough",
    recordType: "probate",
    path: "records_request",
    portalUrl: "https://hover.hillsclerk.com/",
  },
];

/**
 * Upsert filings into the shared feed. The (fips, record_type, doc_number)
 * unique constraint is what makes a nightly re-pull idempotent.
 */
export async function ingestDistressRecords(
  supabase: SupabaseClient<Database>,
  target: { state: string; county: string; recordType: string },
  filings: RawFiling[],
): Promise<number> {
  if (!filings.length) return 0;
  const fips = countyKey(target.state, target.county);
  const rows = filings.map((f) => ({
    fips,
    state: target.state.toUpperCase(),
    county: target.county,
    record_type: target.recordType,
    doc_number: f.doc_number,
    filed_date: f.filed_date ?? null,
    pulled_date: new Date().toISOString().slice(0, 10),
    owner_first: f.owner_first ?? null,
    owner_last: f.owner_last ?? null,
    company_entity: f.company_entity ?? null,
    property_address: f.property_address ?? null,
    property_city: f.property_city ?? null,
    property_state: f.property_state ?? target.state.toUpperCase(),
    property_zip: f.property_zip ?? null,
    amount: f.amount ?? null,
    auction_date: f.auction_date ?? null,
    status: f.status ?? null,
    parcel_apn: f.parcel_apn ?? null,
    source_url: f.source_url ?? null,
    surplus_amount: f.surplus_amount ?? null,
    surplus_basis: f.surplus_basis ?? null,
    sold_to: f.sold_to ?? null,
    estimated: f.estimated ?? false,
    raw: (f.raw ?? {}) as never,
  }));

  // A single county pull can legitimately surface the same document twice
  // (paginated overlap, or two parcels sharing a derived doc number). Postgres
  // rejects an upsert that touches the same conflict target twice, which would
  // throw away the whole batch, so collapse duplicates here and keep the last
  // sighting of each key.
  const deduped = Array.from(
    rows
      .reduce((map, row) => {
        map.set(`${row.fips}|${row.record_type}|${row.doc_number}`, row);
        return map;
      }, new Map<string, (typeof rows)[number]>())
      .values(),
  );

  const { error, count } = await supabase
    .from("distress_records")
    .upsert(deduped as never, { onConflict: "fips,record_type,doc_number", count: "exact" });
  if (error) throw new Error(error.message);

  // The feed table is a flat per-pull log; the case spine is the deduplicated
  // truth an operator works from. Every adapter row goes through the
  // reconciler rather than writing foreclosure_cases directly, so matching and
  // provenance rules live in exactly one place.
  await reconcileFilings(target, fips, filings);

  return count ?? deduped.length;
}

/**
 * Turn already-fetched auction filings into Surplus Funds records.
 *
 * A row with no sold amount produces NOTHING and is counted as
 * `soldAmountUnavailable`, so a county whose pages never publish sale results
 * shows up as a data gap instead of a silent zero. Nothing here estimates,
 * infers or falls back.
 */
export async function deriveAndIngestSurplus(
  supabase: SupabaseClient<Database>,
  target: { state: string; county: string },
  filings: RawFiling[],
  basis: SurplusBasis,
): Promise<SurplusCounters> {
  const counters: SurplusCounters = { ...EMPTY_SURPLUS_COUNTERS, auctions: filings.length };
  const surplusFilings: RawFiling[] = [];

  for (const f of filings) {
    const raw = (f.raw ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (v == null ? null : String(v));
    const soldTo = str(raw["soldTo"]);
    const soldAmount = str(raw["soldAmount"]);
    const { isThirdPartyBidder } = await import("./distress/surplus");
    if (!isThirdPartyBidder(soldTo)) continue;
    counters.soldToThirdParty += 1;
    if (!soldAmount) {
      counters.soldAmountUnavailable += 1;
      continue;
    }
    const derived = deriveSurplus(
      {
        soldAmount,
        soldTo,
        soldDate: str(raw["soldDate"]),
        openingBid: str(raw["openingBid"]),
        finalJudgmentAmount: str(raw["finalJudgmentAmount"]),
      },
      basis,
    );
    if (!derived) continue;
    counters.aboveBaseline += 1;
    surplusFilings.push({
      ...f,
      amount: derived.surplusAmount,
      auction_date: derived.soldDate ?? f.auction_date ?? null,
      status: "surplus_estimated",
      surplus_amount: derived.surplusAmount,
      surplus_basis: derived.surplusBasis,
      sold_to: derived.soldTo,
      estimated: true,
      raw: { ...raw, derived_from: "realauction_sold_result" },
    });
  }

  if (surplusFilings.length) {
    counters.created = await ingestDistressRecords(
      supabase,
      { state: target.state, county: target.county, recordType: "surplus_funds" },
      surplusFilings,
    );
  }
  return counters;
}

/** Record types that belong on the case spine (a legal case, not a snapshot). */
const CASE_RECORD_TYPES = new Set([
  "foreclosure",
  "foreclosure_auction",
  "tax_deed",
  "tax_lien",
  "lis_pendens",
]);

async function reconcileFilings(
  target: { state: string; county: string; recordType: string },
  fips: string,
  filings: RawFiling[],
): Promise<void> {
  if (!CASE_RECORD_TYPES.has(target.recordType)) return;
  try {
    const { reconcileObservations } = await import("./distress/reconcile.server");
    // A vendor auction site is a republished county calendar: authoritative on
    // sale date and opening bid, but outranked by the clerk on anything else.
    const summary = await reconcileObservations(
      filings.map((f) => ({
        fips,
        state: target.state,
        county: target.county,
        recordType: target.recordType,
        sourceClass: observedSourceClass(f),
        sourceUrl: f.source_url ?? null,
        caseNumber: f.doc_number || null,
        parcelApn: f.parcel_apn ?? null,
        propertyAddress: f.property_address ?? null,
        propertyCity: f.property_city ?? null,
        propertyState: f.property_state ?? target.state.toUpperCase(),
        propertyZip: f.property_zip ?? null,
        ownerFirst: f.owner_first ?? null,
        ownerLast: f.owner_last ?? null,
        companyEntity: f.company_entity ?? null,
        caseStatus: f.status ?? null,
        filedDate: f.filed_date ?? null,
        auctionDate: f.auction_date ?? null,
        openingBid: f.amount ?? null,
        raw: (f.raw ?? {}) as Record<string, unknown>,
      })),
    );
    if (summary.failed) {
      console.error(
        `[reconcile] ${target.county} ${target.recordType}: ${summary.failed} observations failed`,
      );
    }
  } catch (err) {
    // Reconciliation is downstream of the feed. A failure here must not lose
    // the night's pull, but it must be loud.
    console.error("[reconcile] batch failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Trust level of the observation. An adapter may state its own class (a
 * licensed vendor API does); otherwise a republished auction page is a vendor
 * feed and everything else is treated as clerk records.
 */
function observedSourceClass(f: RawFiling): import("./distress/reconcile.shared").SourceClass {
  const raw = (f.raw ?? {}) as Record<string, unknown>;
  const declared = String(raw["source_class"] ?? "");
  if (declared) return declared as import("./distress/reconcile.shared").SourceClass;
  return String(raw["source"] ?? "").startsWith("real") ? "vendor_auction" : "clerk_records";
}

/** One nightly sweep across every configured county + record type. */
export async function runNightlyPulls(): Promise<{
  ok: boolean;
  targets: number;
  results: Array<{
    county: string;
    recordType: string;
    found: number;
    added: number;
    error?: string;
    skipped?: string;
    bytes?: number;
    httpStatus?: number | null;
    /** Surplus Funds derivation counters, when this county derives surplus. */
    surplus?: SurplusCounters;
  }>;
  bytesUsed: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results: Array<{
    county: string;
    recordType: string;
    found: number;
    added: number;
    error?: string;
    skipped?: string;
    bytes?: number;
    httpStatus?: number | null;
    /** Surplus Funds derivation counters, when this county derives surplus. */
    surplus?: SurplusCounters;
  }> = [];

  // Static targets win over dynamic ones for the same county + record type, so
  // a hand-tuned pull (e.g. Hillsborough) is never run twice in one sweep.
  const staticKeys = new Set(
    PULL_TARGETS.map((t) => `${t.state}|${t.county}|${t.recordType}`.toLowerCase()),
  );
  let dynamicTargets: PullTarget[] = [];
  try {
    dynamicTargets = (await dynamicRealtaxdeedTargets()).filter(
      (t) => !staticKeys.has(`${t.state}|${t.county}|${t.recordType}`.toLowerCase()),
    );
  } catch (err) {
    console.error("dynamic realtaxdeed targets unavailable:", err instanceof Error ? err.message : err);
  }
  let catalogTargets: PullTarget[] = [];
  try {
    catalogTargets = (await dynamicCatalogTargets()).filter(
      (t) => !staticKeys.has(`${t.state}|${t.county}|${t.recordType}`.toLowerCase()),
    );
  } catch (err) {
    console.error("catalogued targets unavailable:", err instanceof Error ? err.message : err);
  }
  const allTargets = [...PULL_TARGETS, ...dynamicTargets, ...catalogTargets];

  // Per-source crawl interval: the most recent successful pull for a
  // county+record type gates the next one. Sequential, one host at a time —
  // the adapters' own polite fetch keeps per-host throttling in place.
  const { data: recentPulls } = await supabaseAdmin
    .from("distress_pulls")
    .select("fips, record_type, started_at, status")
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1000);
  const lastOk = new Map<string, string>();
  for (const p of recentPulls ?? []) {
    const key = `${p.fips}|${p.record_type}`;
    if (!lastOk.has(key)) lastOk.set(key, String(p.started_at));
  }

  // RealAuction egress: proxy-or-skip. A direct fetch would only 403, so an
  // unavailable proxy skips those counties rather than burning the tick.
  const proxyMod = await import("./data-providers/realauction-proxy");
  const proxy = proxyMod.realauctionProxyStatus();
  proxyMod.startRealauctionBudget();
  let vendorHalted: string | null = proxy.available
    ? null
    : `proxy unavailable — ${proxy.reason ?? "unknown"}`;
  if (vendorHalted) console.error(`[distress-feed] RealAuction sweep skipped: ${vendorHalted}`);

  for (const target of allTargets) {
    if (target.path === "records_request" || !target.pull) {
      // Nothing to fetch: this county/type is supplied by the records-request agent.
      continue;
    }
    if (target.proxied && vendorHalted) {
      results.push({
        county: target.county,
        recordType: target.recordType,
        found: 0,
        added: 0,
        skipped: vendorHalted,
      });
      await supabaseAdmin.from("distress_pulls").insert({
        fips: countyKey(target.state, target.county),
        state: target.state.toUpperCase(),
        county: target.county,
        record_type: target.recordType,
        status: "skipped",
        records_found: 0,
        records_added: 0,
        bytes_downloaded: 0,
        error: vendorHalted,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      } as never);
      continue;
    }
    const interval = target.intervalMinutes ?? 1440;
    const previous = lastOk.get(`${countyKey(target.state, target.county)}|${target.recordType}`);
    if (previous && Date.now() - +new Date(previous) < interval * 60_000) {
      results.push({
        county: target.county,
        recordType: target.recordType,
        found: 0,
        added: 0,
        skipped: `crawl interval ${interval}m not elapsed`,
      });
      continue;
    }
    const startedAt = new Date().toISOString();
    const bytesBefore = proxyMod.bytesUsed();
    let found = 0;
    let added = 0;
    let failure: string | undefined;
    let surplus: SurplusCounters | undefined;
    try {
      const filings = await target.pull();
      found = filings.length;
      added = await ingestDistressRecords(supabaseAdmin, target, filings);
      // Surplus is DERIVED from the same auction rows we just ingested — no
      // second fetch, no second scraper. Only the four proof counties with
      // verified 'records' coverage are enabled in this pass.
      if (target.recordType === "tax_deed" && surplusEnabledFor(target.state, target.county)) {
        surplus = await deriveAndIngestSurplus(supabaseAdmin, target, filings, "opening_bid");
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : "Pull failed";
      if (err instanceof proxyMod.BandwidthCapError) {
        vendorHalted = err.message;
        console.error(`[distress-feed] ${err.message}`);
      } else if (err instanceof proxyMod.ProxyUnavailableError) {
        vendorHalted = err.message;
        console.error(`[distress-feed] ${err.message}`);
      }
    }
    const bytes = target.proxied ? proxyMod.bytesUsed() - bytesBefore : 0;
    const httpStatus = target.proxied ? proxyMod.lastVendorStatus() : null;
    await supabaseAdmin.from("distress_pulls").insert({
      fips: countyKey(target.state, target.county),
      state: target.state.toUpperCase(),
      county: target.county,
      record_type: target.recordType,
      status: failure ? "error" : "ok",
      records_found: found,
      records_added: added,
      bytes_downloaded: bytes,
      http_status: httpStatus,
      error: failure ?? null,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    } as never);
    results.push({
      county: target.county,
      recordType: target.recordType,
      found,
      added,
      error: failure,
      bytes,
      httpStatus,
      surplus,
    });
  }

  const bytesTotal = proxyMod.endRealauctionBudget();
  console.log(`[distress-feed] RealAuction bytes downloaded this sweep: ${bytesTotal}`);
  return { ok: results.every((r) => !r.error), targets: results.length, results, bytesUsed: bytesTotal };
}

/** Record types we are configured to pull for a county, for the county page. */
export function configuredTypes(state: string, county: string): string[] {
  return PULL_TARGETS.filter(
    (t) => t.state.toLowerCase() === state.toLowerCase() && t.county.toLowerCase() === county.toLowerCase(),
  ).map((t) => t.recordType);
}

export const ALL_RECORD_TYPE_IDS = RECORD_TYPES.map((r) => r.id);
