// ---------------------------------------------------------------------------
// Nightly RealeFlow sourcing for the Distress Feed.
//
// Probate / tax-lien / vacancy filings are not published as open data anywhere
// in Florida, so they are licensed from the RealeFlow Partner API instead of
// scraped. This runs one polite, sequential /search per county per record type
// and lands the rows through the SAME upsert path as every other adapter, so
// dedupe, reconciliation and the nightly report behave identically.
// ---------------------------------------------------------------------------

import { FL_COUNTY_FIPS } from "../fl-counties";
import {
  REALEFLOW_COUNTY_BUDGET,
  REALEFLOW_COUNTIES_PER_TICK,
  REALEFLOW_LEAD_CONFIGS,
  REALEFLOW_PAGE_SIZE,
  REALEFLOW_TICK_TIME_BUDGET_MS,
  buildSearchBody,
  isEntitlementError,
  isMailingOptedOut,
  propertyToFiling,
  sliceCounties,
  type RealeflowLeadConfig,
} from "./realeflow-source.shared";

const DOMAIN = "api.realeflow.com";
const PLATFORM = "realeflow";
const SOURCE_CLASS = "licensed_api";
const POLITE_DELAY_MS = 1_000;
const CURSOR_KEY = "realeflow-fl-counties";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where the last tick stopped in the ordered county list. */
async function readCursor(): Promise<{ position: number; cycles: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sourcing_cursors")
    .select("position, cycles")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  const row = data as { position?: number; cycles?: number } | null;
  return { position: Number(row?.position ?? 0) || 0, cycles: Number(row?.cycles ?? 0) || 0 };
}

async function writeCursor(position: number, cycles: number, label: string | null): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("sourcing_cursors").upsert(
    {
      key: CURSOR_KEY,
      position,
      cycles,
      last_label: label,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );
  // A silent cursor failure means the sweep re-pulls the same slice forever —
  // that must at least be visible in the logs.
  if (error) console.error("[realeflow] cursor write failed:", error.message);
}

function entitlementKey(recordType: string): string {
  return `entitlement:${recordType}`;
}

/** Record types previously refused by the API — never retried automatically. */
async function disabledByEntitlement(): Promise<Map<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("data_sources")
    .select("record_type, dataset_id, status, last_error")
    .eq("platform", PLATFORM)
    .eq("status", "disabled");
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    if (String(row.dataset_id ?? "").startsWith("entitlement:")) {
      out.set(String(row.record_type), row.last_error ?? "awaiting entitlement");
    }
  }
  return out;
}

async function markEntitlementDisabled(config: RealeflowLeadConfig, reason: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("data_sources").upsert(
    {
      platform: PLATFORM,
      source_class: SOURCE_CLASS,
      domain: DOMAIN,
      dataset_id: entitlementKey(config.recordType),
      record_type: config.recordType,
      title: `RealeFlow ${config.label} — entitlement`,
      state: "FL",
      status: "disabled",
      last_error: reason,
      field_map: {},
      precedence: 10,
    } as never,
    { onConflict: "platform,domain,dataset_id,record_type" },
  );
}

/** One catalog row per county × record type, verified after a clean pull. */
async function recordCoverage(args: {
  config: RealeflowLeadConfig;
  county: string;
  fips: string;
  rows: number;
  ok: boolean;
  error?: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { data: source } = await supabaseAdmin
    .from("data_sources")
    .upsert(
      {
        platform: PLATFORM,
        source_class: SOURCE_CLASS,
        domain: DOMAIN,
        dataset_id: `search:${args.config.recordType}:${args.fips}`,
        record_type: args.config.recordType,
        resource_url: "https://api.realeflow.com/api/2.0/leadpipes/search",
        title: `RealeFlow ${args.config.label} — ${args.county} County, FL`,
        jurisdiction: `${args.county} County, FL`,
        county_name: args.county,
        state: "FL",
        fips: args.fips,
        // No case/lien number in /search rows: the stable address hash is the
        // dedupe key, namespaced by record type.
        field_map: {
          _doc_number: `${args.config.docPrefix}-<address_hash>`,
          _filter: args.config.filter as never,
        } as never,
        precedence: 10, // licensed API outranks open data
        crawl_interval_minutes: 1440,
        status: args.ok ? "verified" : "failed",
        row_estimate: args.rows || null,
        last_error: args.error ?? null,
        last_verified_at: args.ok ? now : null,
        last_success_at: args.ok ? now : null,
      } as never,
      { onConflict: "platform,domain,dataset_id,record_type" },
    )
    .select("id")
    .maybeSingle();

  const sourceId = (source as { id?: string } | null)?.id ?? null;
  // An empty county is not an error: coverage stays verified with 0 rows.
  const coverage = {
    source_id: sourceId,
    fips: args.fips,
    state: "FL",
    county_name: args.county,
    record_type: args.config.recordType,
    status: args.ok ? "verified" : "failed",
    verified_at: args.ok ? now : null,
    last_success_at: args.ok ? now : null,
    sample_row_count: args.rows,
  };
  let query = supabaseAdmin
    .from("source_coverage")
    .select("id")
    .eq("fips", args.fips)
    .eq("record_type", args.config.recordType);
  query = sourceId ? query.eq("source_id", sourceId) : query.is("source_id", null);
  const { data: existing } = await query.maybeSingle();
  if (existing?.id) {
    await supabaseAdmin
      .from("source_coverage")
      .update(coverage as never)
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("source_coverage").insert(coverage as never);
  }
}

export type RealeflowPullResult = {
  recordType: string;
  county: string;
  fips: string;
  found: number;
  added: number;
  error?: string;
};

export type RealeflowSourcingReport = {
  ok: boolean;
  requests: number;
  results: RealeflowPullResult[];
  awaitingEntitlement: Array<{ recordType: string; reason: string }>;
  /** Present when the tick stopped before its slice because time ran out. */
  stoppedEarly?: string;
  /** Cursor bookkeeping — absent when an explicit county list was passed. */
  cursor?: {
    from: number;
    to: number;
    total: number;
    counties: string[];
    wrapped: boolean;
    cycles: number;
  };
  byRecordType: Array<{
    recordType: string;
    countiesPulled: number;
    rowsUpserted: number;
    dupesSkipped: number;
    countiesWithZeroRows: number;
    countiesFailed: number;
  }>;
};

/**
 * Sweep FL counties for every enabled lead-type config. Sequential with a ≥1s
 * delay; a per-county page budget keeps the request count bounded.
 *
 * The default (cron) path is RESUMABLE: one tick processes a bounded slice of the
 * ordered county list starting from a persisted cursor, then advances it and
 * wraps at the end, so the full 67-county × 3-type matrix is covered over
 * successive runs instead of being truncated mid-alphabet by the invocation's
 * wall clock. Passing an explicit `counties` list (demos, manual refreshes) runs
 * those counties synchronously in one call and never touches the cursor.
 */
export async function runRealeflowSourcing(
  options: {
    counties?: string[];
    recordTypes?: string[];
    countyBudget?: number;
    maxCountiesPerTick?: number;
  } = {},
): Promise<RealeflowSourcingReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { countyKey } = await import("../distress-feed.shared");
  const { ingestDistressRecords, splitOwner } = await import("../distress-feed.server");
  const { rfSearch, RealeflowError } = await import("../realeflow/client.server");

  const disabled = await disabledByEntitlement();
  const awaitingEntitlement: Array<{ recordType: string; reason: string }> = [];
  const configs = REALEFLOW_LEAD_CONFIGS.filter((c) => {
    if (options.recordTypes && !options.recordTypes.includes(c.recordType)) return false;
    if (!c.enabled) {
      awaitingEntitlement.push({
        recordType: c.recordType,
        reason: c.disabledReason ?? "config disabled",
      });
      return false;
    }
    const reason = disabled.get(c.recordType);
    if (reason) {
      awaitingEntitlement.push({ recordType: c.recordType, reason });
      return false;
    }
    return true;
  });

  const explicit = Boolean(options.counties?.length);
  const allCounties = (options.counties ?? Object.keys(FL_COUNTY_FIPS)).filter(
    (c) => FL_COUNTY_FIPS[c],
  );

  let counties = allCounties;
  let cursorReport: RealeflowSourcingReport["cursor"];
  let start = 0;
  let cycles = 0;
  if (!explicit) {
    const stored = await readCursor();
    start = stored.position;
    cycles = stored.cycles;
    const sliced = sliceCounties({
      counties: allCounties,
      cursor: start,
      maxCounties: options.maxCountiesPerTick ?? REALEFLOW_COUNTIES_PER_TICK,
    });
    counties = sliced.slice;
    cursorReport = {
      from: start % (allCounties.length || 1),
      to: sliced.nextCursor,
      total: allCounties.length,
      counties: sliced.slice,
      wrapped: sliced.wrapped,
      cycles: sliced.wrapped ? cycles + 1 : cycles,
    };
  }
  const budget = Math.min(Math.max(options.countyBudget ?? REALEFLOW_COUNTY_BUDGET, 1), 500);
  const results: RealeflowPullResult[] = [];
  let requests = 0;

  // County-outer with a per-county cursor checkpoint. The host kills long
  // invocations (~25-30s observed 2026-08-25/26: every tick died after
  // probate × 6 counties, BEFORE the old end-of-run cursor write), so a tick
  // must complete WHOLE counties (every enabled type), persist progress after
  // each one, and stop starting new counties once the time budget is spent.
  const stoppedByEntitlement = new Set<string>();
  const tickStartedAt = Date.now();
  let countiesCompleted = 0;
  let timedOut = false;

  for (const county of counties) {
    if (!explicit && Date.now() - tickStartedAt >= REALEFLOW_TICK_TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    const fips = FL_COUNTY_FIPS[county]!;
    const feedKey = countyKey("FL", county);

    for (const config of configs) {
      if (stoppedByEntitlement.has(config.recordType)) continue;
      const startedAt = new Date().toISOString();
      let found = 0;
      let added = 0;
      let failure: string | undefined;

      try {
        const filings: Array<ReturnType<typeof propertyToFiling>> = [];
        for (let page = 1; filings.length < budget; page += 1) {
          const body = buildSearchBody({
            fips,
            config,
            page,
            pageSize: Math.min(REALEFLOW_PAGE_SIZE, budget - filings.length),
          });
          requests += 1;
          const res = await rfSearch(body);
          const rows = res.data ?? [];
          for (const property of rows) {
            if (isMailingOptedOut(property)) continue;
            const filing = propertyToFiling(config, county, property, splitOwner);
            if (filing) filings.push(filing);
          }
          if (rows.length < (body.page_size ?? REALEFLOW_PAGE_SIZE)) break;
          await sleep(POLITE_DELAY_MS);
        }

        const usable = filings.filter((f): f is NonNullable<typeof f> => Boolean(f));
        found = usable.length;
        added = await ingestDistressRecords(
          supabaseAdmin,
          { state: "FL", county, recordType: config.recordType },
          usable,
        );
        await recordCoverage({ config, county, fips, rows: found, ok: true });
      } catch (err) {
        const status = err instanceof RealeflowError ? err.status : 0;
        const message = err instanceof Error ? err.message : String(err);
        if (isEntitlementError(status, message)) {
          // Licensing, not a fault: disable the config and stop hammering.
          await markEntitlementDisabled(config, message);
          awaitingEntitlement.push({ recordType: config.recordType, reason: message });
          stoppedByEntitlement.add(config.recordType);
          failure = `awaiting entitlement: ${message}`;
        } else {
          failure = message;
          await recordCoverage({ config, county, fips, rows: 0, ok: false, error: message });
        }
      }

      await supabaseAdmin.from("distress_pulls").insert({
        fips: feedKey,
        state: "FL",
        county,
        record_type: config.recordType,
        status: failure ? "error" : "ok",
        records_found: found,
        records_added: added,
        error: failure ?? null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      } as never);

      results.push({ recordType: config.recordType, county, fips, found, added, error: failure });
      await sleep(POLITE_DELAY_MS);
    }

    countiesCompleted += 1;
    // Checkpoint after EVERY completed county (advancing even when a county
    // errored — a permanently failing county must never stall the matrix), so
    // a mid-run kill resumes at the NEXT county instead of restarting.
    if (cursorReport) {
      const absolute = cursorReport.from + countiesCompleted;
      const wrappedNow = absolute >= cursorReport.total;
      await writeCursor(wrappedNow ? 0 : absolute, wrappedNow ? cycles + 1 : cycles, county);
    }
  }

  const byRecordType = [...new Set(results.map((r) => r.recordType))].map((recordType) => {
    const rows = results.filter((r) => r.recordType === recordType);
    const clean = rows.filter((r) => !r.error);
    return {
      recordType,
      countiesPulled: clean.length,
      rowsUpserted: clean.reduce((sum, r) => sum + r.added, 0),
      dupesSkipped: clean.reduce((sum, r) => sum + Math.max(r.found - r.added, 0), 0),
      countiesWithZeroRows: clean.filter((r) => r.found === 0).length,
      countiesFailed: rows.length - clean.length,
    };
  });

  // The cursor was checkpointed per completed county above; the report must
  // describe what ACTUALLY ran, not the planned slice (the tick may have
  // stopped early on the time budget).
  if (cursorReport) {
    const absolute = cursorReport.from + countiesCompleted;
    const wrappedNow = absolute >= cursorReport.total;
    cursorReport = {
      ...cursorReport,
      to: wrappedNow ? 0 : absolute,
      counties: counties.slice(0, countiesCompleted),
      wrapped: wrappedNow,
      cycles: wrappedNow ? cycles + 1 : cycles,
    };
  }

  return {
    ok: results.every((r) => !r.error),
    requests,
    results,
    awaitingEntitlement,
    ...(cursorReport ? { cursor: cursorReport } : {}),
    ...(timedOut ? { stoppedEarly: "tick time budget reached" } : {}),
    byRecordType,
  };
}
