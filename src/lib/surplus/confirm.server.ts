/**
 * Phase 2 orchestration (server-only): read a clerk source, reconcile what it
 * published against the phase 1 derived records, and record when we last
 * checked.
 *
 * Invariants:
 *  - Only 'live' sources produce customer-facing rows. 'unverified' is a
 *    holding state until a human confirms the handler against a real page.
 *  - A source that returns nothing records zero WITH a reason. Nothing here
 *    ever falls back to the derived value and calls it confirmed.
 *  - confirmed_as_of is the fetch timestamp, never the row-write timestamp.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SURPLUS_HANDLERS, type ClerkSurplusRow, type SurplusSourceRow } from "./handlers";
import { matchConfirmation, needsVarianceReview, variancePct, type DerivedRecord } from "./reconcile";
import { resolveClaimDeadline, type SaleKind, type StatuteRow } from "./deadline";
import { CADENCE_DAYS } from "./freshness";

type DB = SupabaseClient<Database>;

export type SourceRunResult = {
  sourceId: string;
  county: string;
  state: string;
  handler: string;
  fetched: number;
  confirmed: number;
  matched: number;
  unmatched: number;
  fuzzy: number;
  flaggedVariance: number;
  deadlinesUnverified: number;
  bytes: number;
  skipped?: string;
  reason?: string;
  error?: string;
};

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

export async function loadStatutes(db: DB): Promise<StatuteRow[]> {
  const { data } = await db.from("surplus_statutes").select("*");
  return (data ?? []) as unknown as StatuteRow[];
}

/**
 * Sources due for a check. Cadence is the source's own, except that a source
 * with records inside 30 days of a deadline is checked daily — handled per
 * record in `dueRecordChecks`.
 */
export async function dueSources(db: DB, opts: { includeUnverified?: boolean } = {}): Promise<SurplusSourceRow[]> {
  const statuses = opts.includeUnverified ? ["live", "unverified", "broken"] : ["live", "broken"];
  const { data } = await db
    .from("surplus_sources")
    .select("*")
    .in("status", statuses);
  const rows = (data ?? []) as unknown as SurplusSourceRow[];
  const now = Date.now();
  return rows.filter((s) => {
    if (!s.last_checked_at) return true;
    const age = (now - Date.parse(s.last_checked_at)) / 86_400_000;
    return age >= CADENCE_DAYS[s.refresh_cadence];
  });
}

/** Derived phase 1 surplus records for a county, as match candidates. */
async function derivedCandidates(db: DB, state: string, county: string): Promise<DerivedRecord[]> {
  const { data } = await db
    .from("distress_records")
    .select("id, doc_number, parcel_apn, property_address, auction_date, surplus_amount")
    .eq("record_type", "surplus_funds")
    .eq("state", state.toUpperCase())
    .ilike("county", county)
    .limit(5000);
  return (data ?? []) as unknown as DerivedRecord[];
}

/**
 * Run one source end to end. Errors are captured, not thrown: one broken clerk
 * page must not abort the sweep for the other counties.
 */
export async function runSurplusSource(
  source: SurplusSourceRow,
  opts: { statutes?: StatuteRow[]; dryRun?: boolean } = {},
): Promise<SourceRunResult> {
  const db = await admin();
  const base: SourceRunResult = {
    sourceId: source.id,
    county: source.county_name,
    state: source.state,
    handler: source.handler,
    fetched: 0,
    confirmed: 0,
    matched: 0,
    unmatched: 0,
    fuzzy: 0,
    flaggedVariance: 0,
    deadlinesUnverified: 0,
    bytes: 0,
  };

  const handler = SURPLUS_HANDLERS[source.handler];
  if (!handler) {
    return { ...base, skipped: `No handler named ${source.handler}` };
  }

  let result: Awaited<ReturnType<typeof handler>>;
  try {
    result = await handler({ source });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!opts.dryRun) await markSourceFailure(db, source, message);
    return { ...base, error: message };
  }

  base.fetched = result.rows.length;
  base.bytes = result.bytes;
  base.reason = result.reason;

  if (opts.dryRun) return base;

  // A deferred source (records request) is neither a success nor a failure: the
  // rows arrive later through the request pipeline.
  if (result.deferred) {
    await db
      .from("surplus_sources")
      .update({ last_checked_at: new Date().toISOString(), notes: result.reason ?? source.notes })
      .eq("id", source.id);
    return base;
  }

  if (!result.rows.length) {
    await markSourceFailure(db, source, result.reason ?? "Source returned no rows");
    return base;
  }

  // Only a promoted source may write customer-facing confirmations.
  if (source.status !== "live") {
    await db
      .from("surplus_sources")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", source.id);
    return { ...base, skipped: `Source is '${source.status}' — parsed ${result.rows.length} rows, wrote none` };
  }

  const statutes = opts.statutes ?? (await loadStatutes(db));
  const candidates = await derivedCandidates(db, source.state, source.county_name);
  const payload: Array<Record<string, unknown>> = [];

  for (const row of result.rows) {
    const match = matchConfirmation(row, candidates);
    const derivedAmount = match.derived?.surplus_amount ?? null;
    const pct = variancePct(derivedAmount, row.confirmed_amount);
    const flagged = needsVarianceReview(pct);
    if (match.derived) base.matched += 1;
    else base.unmatched += 1;
    if (match.fuzzy) base.fuzzy += 1;
    if (flagged) base.flaggedVariance += 1;

    const deadline = resolveClaimDeadline({
      state: source.state,
      saleKind: source.sale_kind as SaleKind,
      statutes,
      basis: { sale_date: row.sale_date },
      clerkDeadline: row.claim_deadline,
    });
    const storedDeadline =
      deadline.status === "clerk" || deadline.status === "computed" ? deadline.deadline : null;
    if (!storedDeadline) base.deadlinesUnverified += 1;

    payload.push({
      county_name: source.county_name,
      state: source.state.toUpperCase(),
      sale_kind: source.sale_kind,
      case_number: row.case_number,
      parcel_apn: row.parcel_apn,
      property_address: row.property_address,
      confirmed_amount: row.confirmed_amount,
      sale_date: row.sale_date,
      claim_deadline: storedDeadline,
      deadline_from_clerk: deadline.status === "clerk",
      claim_status: row.claim_status,
      claimant_name: row.claimant_name,
      source_id: source.id,
      source_url: source.source_url,
      confirmed_as_of: result.fetchedAt,
      derived_record_id: match.derived?.id ?? null,
      derived_amount: derivedAmount,
      match_method: match.method,
      match_is_fuzzy: match.fuzzy,
      variance_pct: pct,
      needs_review: flagged,
      raw: row.raw,
    });
  }

  // The dedupe index is expressional (COALESCE over the nullable identifier
  // columns), so PostgREST cannot resolve it as an on_conflict target. Split the
  // batch by the same key here instead of loosening the constraint.
  const dedupeKey = (r: { case_number?: unknown; parcel_apn?: unknown; sale_date?: unknown }) =>
    [r.case_number ?? "", r.parcel_apn ?? "", r.sale_date ?? "1900-01-01"].join("|");

  const { data: existingRows } = await db
    .from("surplus_confirmations")
    .select("id, case_number, parcel_apn, sale_date")
    .eq("state", source.state.toUpperCase())
    .ilike("county_name", source.county_name)
    .eq("sale_kind", source.sale_kind);
  const existing = new Map<string, string>();
  for (const r of existingRows ?? []) existing.set(dedupeKey(r), r.id);

  const inserts = payload.filter((r) => !existing.has(dedupeKey(r)));
  const updates = payload.filter((r) => existing.has(dedupeKey(r)));

  if (inserts.length) {
    const { error } = await db.from("surplus_confirmations").insert(inserts as never);
    if (error) {
      await markSourceFailure(db, source, error.message);
      return { ...base, error: error.message };
    }
  }
  for (const row of updates) {
    const { error } = await db
      .from("surplus_confirmations")
      .update(row as never)
      .eq("id", existing.get(dedupeKey(row))!);
    if (error) {
      await markSourceFailure(db, source, error.message);
      return { ...base, error: error.message };
    }
  }
  base.confirmed = payload.length;

  await db
    .from("surplus_sources")
    .update({
      last_checked_at: new Date().toISOString(),
      last_success_at: result.fetchedAt,
      consecutive_failures: 0,
      status: "live",
    })
    .eq("id", source.id);

  return base;
}

/**
 * A source that fails twice its cadence in a row is marked broken, which is
 * what surfaces "Confirmation stale" on its records instead of hiding it.
 */
async function markSourceFailure(db: DB, source: SurplusSourceRow, reason: string): Promise<void> {
  const failures = (source.consecutive_failures ?? 0) + 1;
  await db
    .from("surplus_sources")
    .update({
      last_checked_at: new Date().toISOString(),
      consecutive_failures: failures,
      status: source.status === "unverified" ? "unverified" : failures >= 2 ? "broken" : source.status,
      notes: reason.slice(0, 500),
    })
    .eq("id", source.id);
}

/** Nightly sweep across every due source. */
export async function sweepSurplusSources(
  opts: { includeUnverified?: boolean } = {},
): Promise<{ results: SourceRunResult[] }> {
  const db = await admin();
  const [sources, statutes] = await Promise.all([
    dueSources(db, { includeUnverified: opts.includeUnverified }),
    loadStatutes(db),
  ]);
  const results: SourceRunResult[] = [];
  for (const source of sources) {
    results.push(await runSurplusSource(source, { statutes }));
  }
  return { results };
}
