// ---------------------------------------------------------------------------
// Coverage gate. A county/record type is runnable only when source_coverage
// carries a `verified` row for it. Nothing else runs — we would rather tell an
// operator "we don't look there yet" than hand them fabricated records.
// ---------------------------------------------------------------------------

import type { CoverageRow } from "../coverage.shared";
import { splitCountyLabel } from "../coverage.shared";
import { storedSlugsForRecordType } from "../record-types";

/** Thrown when a run has no verified coverage at all. */
export class NoCoverageError extends Error {
  readonly code = "no_coverage";
  constructor(message: string) {
    super(message);
    this.name = "NoCoverageError";
  }
}

/** Thrown when the request is too vague to price — e.g. a state with no counties. */
export class ScopeTooBroadError extends Error {
  readonly code = "scope_too_broad";
  constructor(message: string) {
    super(message);
    this.name = "ScopeTooBroadError";
  }
}

/**
 * Coverage reads only touch `source_coverage`, which is readable with the
 * publishable key. Prefer the admin client (writes via the sync RPC), but fall
 * back to a publishable-key client when the service-role key is unavailable in
 * this runtime — a missing key must never blank the assistant.
 */
type AdminClient = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

async function admin(): Promise<AdminClient> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Touch a property so the lazy proxy throws here, not at query time.
    void supabaseAdmin.from;
    return supabaseAdmin;
  } catch {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    return createClient(process.env.SUPABASE_URL ?? "", key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    }) as unknown as AdminClient;
  }
}



/** Primary gate: is this FIPS + record type verified? */
export async function hasCoverage(fips: string, recordType: string): Promise<boolean> {
  // A picker slug can be stored under several provider-native spellings
  // (Tax Default → tax_lien / tax_deed / …), so match ANY of them.
  const typeKeys = storedSlugsForRecordType(recordType);
  const supabase = await admin();
  const read = async () => {
    const { data } = await supabase
      .from("source_coverage")
      .select("id")
      .eq("status", "verified")
      .eq("fips", fips)
      .in("record_type", typeKeys)
      .limit(1);
    return (data ?? []).length > 0;
  };
  if (await read()) return true;
  // Nothing registered — reconcile the registry against the records database
  // before declaring this county / record type unavailable.
  await syncDataBackedCoverage();
  return read();
}

/**
 * Before answering "is X available?", reconcile the registry against the whole
 * records database: any county / record-type pair that actually holds rows is
 * registered as verified coverage. Without this the assistant can claim a lead
 * type is unavailable while thousands of its records sit in the database.
 */
export async function syncDataBackedCoverage(): Promise<number> {
  try {
    const supabase = await admin();
    const { data } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: number | null }>;
    }).rpc("sync_data_backed_coverage");
    return data ?? 0;
  } catch {
    return 0;
  }
}

/** Every verified row, for label-based lookups and UI hints. */
export async function verifiedCoverage(): Promise<CoverageRow[]> {
  await syncDataBackedCoverage();
  const supabase = await admin();
  const { data } = await supabase
    .from("source_coverage")
    .select("fips, state, county_name, record_type, status, verified_at, last_success_at, sample_row_count")
    .eq("status", "verified");
  return (data ?? []) as unknown as CoverageRow[];
}

/**
 * County labels are how jobs and the assistant talk about geography
 * ("Cook, IL"), so resolve them to verified FIPS before running.
 */
export async function coveredFipsForCounty(
  countyLabel: string,
  recordType: string,
): Promise<string[]> {
  const { county, state } = splitCountyLabel(countyLabel);
  // Match every stored spelling of this record type (Tax Default is registered
  // under tax_lien in source_coverage because that's what the ingest writes).
  const typeKeys = storedSlugsForRecordType(recordType);
  const supabase = await admin();
  const read = async () => {
    let q = supabase
      .from("source_coverage")
      .select("fips")
      .eq("status", "verified")
      .in("record_type", typeKeys)
      .ilike("county_name", county);
    if (state) q = q.eq("state", state);
    const { data } = await q;
    return (data ?? []).map((r) => (r as { fips: string }).fips);
  };
  const hits = await read();
  if (hits.length) return hits;
  // Nothing registered — reconcile against the records database before we
  // tell anyone this county / record type isn't available.
  await syncDataBackedCoverage();
  return read();
}

export async function hasCountyCoverage(
  countyLabel: string,
  recordType: string,
): Promise<boolean> {
  return (await coveredFipsForCounty(countyLabel, recordType)).length > 0;
}

export type CoveragePair = { county: string; recordType: string };
export type CoverageSplit = {
  covered: CoveragePair[];
  uncovered: CoveragePair[];
  /** Counties with at least one covered record type. */
  coveredCounties: string[];
  uncoveredCounties: string[];
};

/** Split a job's selections so the covered portion can still run. */
export async function splitSelections(
  counties: string[],
  recordTypes: string[],
): Promise<CoverageSplit> {
  const covered: CoveragePair[] = [];
  const uncovered: CoveragePair[] = [];
  for (const county of counties) {
    for (const recordType of recordTypes) {
      const ok = await hasCountyCoverage(county, recordType);
      (ok ? covered : uncovered).push({ county, recordType });
    }
  }
  const coveredCounties = [...new Set(covered.map((p) => p.county))];
  const uncoveredCounties = [...new Set(uncovered.map((p) => p.county))].filter(
    (c) => !coveredCounties.includes(c),
  );
  return { covered, uncovered, coveredCounties, uncoveredCounties };
}

/**
 * Log demand for an uncovered county/record type. Uses the existing adapter
 * request backlog so the platform roadmap ranks coverage gaps beside every
 * other source request instead of in a second, competing queue.
 */
export async function logCoverageRequests(
  pairs: CoveragePair[],
  ctx: { workspaceId: string; requestedBy?: string | null },
): Promise<number> {
  if (!pairs.length) return 0;
  const supabase = await admin();
  const rows = pairs.map((p) => ({
    workspace_id: ctx.workspaceId,
    requested_by: ctx.requestedBy ?? null,
    type: "coverage",
    county: p.county,
    record_type: p.recordType,
    source_label: `${p.county} — ${p.recordType}`,
    status: "queued",
  }));
  const { error } = await supabase.from("adapter_requests").insert(rows as never);
  if (error) return 0;
  return rows.length;
}

/** How many workspaces asked for this county/record type. Drives the UI count. */
export async function coverageDemand(county: string, recordType: string): Promise<number> {
  const supabase = await admin();
  const { data } = await supabase
    .from("adapter_requests")
    .select("workspace_id")
    .ilike("county", county)
    .eq("record_type", recordType)
    .limit(1000);
  return new Set((data ?? []).map((r) => (r as { workspace_id: string }).workspace_id)).size;
}

export type MatrixCell = {
  state: string;
  record_type: string;
  verified_counties: number;
  total_counties: number;
  last_success_at: string | null;
};

/** states × record types grid for the admin coverage matrix. */
export async function coverageMatrix(): Promise<{
  cells: MatrixCell[];
  states: string[];
  recordTypes: string[];
}> {
  const supabase = await admin();
  const { data } = await supabase
    .from("source_coverage")
    .select("state, county_name, record_type, status, last_success_at");
  const rows = (data ?? []) as unknown as Array<{
    state: string;
    county_name: string | null;
    record_type: string;
    status: string;
    last_success_at: string | null;
  }>;

  const { data: types } = await supabase.from("record_types").select("name").order("sort_order");
  const recordTypes = ((types ?? []) as Array<{ name: string }>).map((t) => t.name);

  const byCell = new Map<string, MatrixCell>();
  for (const r of rows) {
    const key = `${r.state}::${r.record_type}`;
    const cell =
      byCell.get(key) ??
      ({
        state: r.state,
        record_type: r.record_type,
        verified_counties: 0,
        total_counties: 0,
        last_success_at: null,
      } satisfies MatrixCell);
    cell.total_counties += 1;
    if (r.status === "verified") cell.verified_counties += 1;
    if (r.last_success_at && (!cell.last_success_at || r.last_success_at > cell.last_success_at)) {
      cell.last_success_at = r.last_success_at;
    }
    byCell.set(key, cell);
  }

  const cells = [...byCell.values()];
  const states = [...new Set(cells.map((c) => c.state))].sort();
  const extra = [...new Set(cells.map((c) => c.record_type))].filter((t) => !recordTypes.includes(t));
  return { cells, states, recordTypes: [...recordTypes, ...extra] };
}
// ---------------------------------------------------------------------------
// The chokepoint. Every path that creates or runs a list crosses this: the AI
// assistant, the manual List Builder, template presets, feed subscriptions,
// recurring runs and the public API. Same shape as assertCanText in
// optout.server.ts — one function, it throws, everything inherits it.
// ---------------------------------------------------------------------------

export type JobCoverageInput = {
  sourceType: string | null | undefined;
  recordType?: string | null;
  recordTypes?: string[] | null;
  counties?: string[] | null;
  states?: string[] | null;
};

export type JobCoverageVerdict = {
  /** Does coverage even apply? Business scrapes and uploads are nationwide. */
  gated: boolean;
  status: "covered" | "partial" | "none" | "scope_too_broad";
  requestedCounties: string[];
  coveredCounties: string[];
  uncoveredCounties: string[];
  recordTypes: string[];
  /** Copy the UI shows verbatim — one source of truth for the wording. */
  message: string | null;
};

/** Sources whose geography is served by a county-level public-records adapter. */
// distress_feed pulls from filings that were already paid for and verified at
// pull time, so it is not re-gated here.
const GATED_SOURCES = new Set(["records", "street_scan"]);

function partialMessage(v: { ran: number; requested: number; uncovered: number }): string {
  return `Ran ${v.ran} of ${v.requested} counties. ${v.uncovered} not yet covered — we've logged your request.`;
}

/** Read-only verdict. Used by the UI before pricing and by the gate below. */
export async function jobCoverage(input: JobCoverageInput): Promise<JobCoverageVerdict> {
  const counties = (input.counties ?? []).filter(Boolean);
  const recordTypes = (
    input.recordTypes?.length ? input.recordTypes : [input.recordType]
  ).filter((t): t is string => Boolean(t));

  if (!input.sourceType || !GATED_SOURCES.has(input.sourceType)) {
    return {
      gated: false,
      status: "covered",
      requestedCounties: counties,
      coveredCounties: counties,
      uncoveredCounties: [],
      recordTypes,
      message: null,
    };
  }

  if (input.sourceType === "records" && !recordTypes.length) {
    return {
      gated: true,
      status: "scope_too_broad",
      requestedCounties: counties,
      coveredCounties: [],
      uncoveredCounties: counties,
      recordTypes,
      message: "Pick a record type before we can price this list.",
    };
  }

  // A state with no counties is not "all counties" — it's an unanswered
  // question. Assuming all of them silently multiplies the credit estimate.
  if (!counties.length) {
    return {
      gated: true,
      status: "scope_too_broad",
      requestedCounties: [],
      coveredCounties: [],
      uncoveredCounties: [],
      recordTypes,
      message:
        "Which counties? Pick the counties you want — we never widen a run to an entire state on your behalf.",
    };
  }

  const split = await splitSelections(counties, recordTypes.length ? recordTypes : ["*"]);
  const covered = split.coveredCounties;
  const uncovered = split.uncoveredCounties;

  if (!covered.length) {
    return {
      gated: true,
      status: "none",
      requestedCounties: counties,
      coveredCounties: [],
      uncoveredCounties: uncovered,
      recordTypes,
      message: `We don't cover ${uncovered.join(", ")} for ${recordTypes.join(", ") || "this record type"} yet. Nothing was priced and no credits were spent — request it and we'll add it to the build queue.`,
    };
  }

  return {
    gated: true,
    status: uncovered.length ? "partial" : "covered",
    requestedCounties: counties,
    coveredCounties: covered,
    uncoveredCounties: uncovered,
    recordTypes,
    message: uncovered.length
      ? partialMessage({ ran: covered.length, requested: counties.length, uncovered: uncovered.length })
      : null,
  };
}

/**
 * Hard gate. Refuses a run with zero covered county/record-type combinations,
 * and logs the gap as demand so the request the operator just made is not lost.
 */
export async function assertJobCoverage(
  input: JobCoverageInput & { workspaceId?: string | null; requestedBy?: string | null },
): Promise<JobCoverageVerdict> {
  const verdict = await jobCoverage(input);
  if (!verdict.gated) return verdict;

  if (verdict.status === "scope_too_broad") {
    throw new ScopeTooBroadError(verdict.message ?? "Narrow this list before running it.");
  }

  if (verdict.uncoveredCounties.length && input.workspaceId) {
    await logCoverageRequests(
      verdict.uncoveredCounties.flatMap((county) =>
        (verdict.recordTypes.length ? verdict.recordTypes : ["Public Records"]).map((recordType) => ({
          county,
          recordType,
        })),
      ),
      { workspaceId: input.workspaceId, requestedBy: input.requestedBy ?? null },
    );
  }

  if (verdict.status === "none") {
    throw new NoCoverageError(verdict.message ?? "No verified coverage for this selection.");
  }
  return verdict;
}

/** Every record type with at least one verified source, for the picker. */
export async function coveredRecordTypes(): Promise<string[]> {
  const rows = await verifiedCoverage();
  return [...new Set(rows.map((r) => r.record_type))].sort();
}
