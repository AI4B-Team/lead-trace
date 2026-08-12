/**
 * Reads for the workspace-facing Surplus Funds feed.
 *
 * Everything goes through `surplus_records_visible`. The published-state gate
 * lives inside that view, so there is no way to call this and accidentally
 * surface a state whose statute rules are unverified. Do not swap this back to
 * `distress_records` without re-adding the statute join.
 */
import { ESCHEAT_BUCKETS } from "./feed.shared";
import type { SurplusFeedRecord } from "./feed.shared";
import { SURPLUS_EXPORT_COLUMNS, type SurplusFilters } from "./feed.schema";

const VIEW = "surplus_records_visible";
const EXPORT_ROW_CAP = 50_000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Membership check — the caller may only scope the feed to their own workspace. */
export async function assertMember(
  supabase: { from: (t: string) => any },
  userId: string,
  workspaceId: string | null,
): Promise<void> {
  if (!workspaceId) return;
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("You do not have access to that workspace.");
}

function buildQuery(db: any, f: SurplusFilters, select: string, count = false) {
  let q = db.from(VIEW).select(select, count ? { count: "exact" } : undefined);

  // Derived rows are public-records data and carry no workspace; clerk
  // confirmations are workspace-scoped and must stay private.
  q = f.workspaceId
    ? q.or(`workspace_id.is.null,workspace_id.eq.${f.workspaceId}`)
    : q.is("workspace_id", null);

  if (f.states.length) q = q.in("state_code", f.states);
  if (f.counties.length) q = q.in("county_fips", f.counties);
  if (f.saleTypes.length) q = q.in("sale_type", f.saleTypes);
  if (f.confidence.length) q = q.in("confidence", f.confidence);

  if (f.minAmount !== null) q = q.gte("surplus_amount", f.minAmount);
  if (f.maxAmount !== null) q = q.lte("surplus_amount", f.maxAmount);

  if (f.saleDateFrom) q = q.gte("sale_date", f.saleDateFrom);
  if (f.saleDateTo) q = q.lte("sale_date", f.saleDateTo);

  // Buckets are ORed against each other. Each is a half-open range on
  // days_to_escheat; a record with no countdown never matches a bucket.
  if (f.escheatBuckets.length) {
    const clauses = f.escheatBuckets.flatMap((value) => {
      const bucket = ESCHEAT_BUCKETS.find((b) => b.value === value);
      if (!bucket) return [];
      const parts: string[] = [];
      if (bucket.min !== null) parts.push(`days_to_escheat.gte.${bucket.min}`);
      if (bucket.max !== null) parts.push(`days_to_escheat.lt.${bucket.max}`);
      return [parts.length > 1 ? `and(${parts.join(",")})` : parts[0]!];
    });
    if (clauses.length) q = q.or(clauses.join(","));
  }

  return q;
}

export async function listRecords(f: SurplusFilters) {
  const db = await admin();
  const from = (f.page - 1) * f.pageSize;
  const { data, error, count } = await buildQuery(db, f, "*", true)
    // Urgency is the product: soonest deadline first, unknown deadlines last.
    .order("days_to_escheat", { ascending: true, nullsFirst: false })
    .order("surplus_amount", { ascending: false })
    .range(from, from + f.pageSize - 1);
  if (error) throw new Error(`Could not load surplus records: ${error.message}`);
  return {
    records: (data ?? []) as unknown as SurplusFeedRecord[],
    total: count ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  };
}

/** States that actually have visible records — unpublished states never appear. */
export async function listStates(workspaceId: string | null) {
  const db = await admin();
  const { data, error } = await db.from(VIEW).select("state_code").limit(20_000);
  void workspaceId;
  if (error) throw new Error(`Could not load states: ${error.message}`);
  return [...new Set(((data ?? []) as { state_code: string }[]).map((r) => r.state_code))].sort();
}

/**
 * County options for the dependent filter, scoped to the selected states so the
 * picker can never offer a county that resolves outside them.
 */
export async function listCounties(states: string[]) {
  if (!states.length) return [];
  const db = await admin();
  const { data, error } = await db
    .from(VIEW)
    .select("county_fips, county_name, state_code")
    .in("state_code", states)
    .limit(20_000);
  if (error) throw new Error(`Could not load counties: ${error.message}`);
  const seen = new Map<string, { fips: string; name: string; stateCode: string }>();
  for (const row of (data ?? []) as {
    county_fips: string | null;
    county_name: string | null;
    state_code: string;
  }[]) {
    if (!row.county_fips || seen.has(row.county_fips)) continue;
    seen.set(row.county_fips, {
      fips: row.county_fips,
      name: row.county_name ?? "Unknown County",
      stateCode: row.state_code,
    });
  }
  return [...seen.values()].sort(
    (a, b) => a.stateCode.localeCompare(b.stateCode) || a.name.localeCompare(b.name),
  );
}

export async function exportRecords(f: SurplusFilters) {
  const db = await admin();
  const { data, error } = await buildQuery(db, f, "*")
    .order("days_to_escheat", { ascending: true, nullsFirst: false })
    .limit(EXPORT_ROW_CAP);
  if (error) throw new Error(`Export failed: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    SURPLUS_EXPORT_COLUMNS.map((c) => escape(c.label)).join(","),
    ...rows.map((row) => SURPLUS_EXPORT_COLUMNS.map((c) => escape(row[c.key])).join(",")),
  ].join("\n");

  return {
    filename: `surplus-funds-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    rowCount: rows.length,
    truncated: rows.length >= EXPORT_ROW_CAP,
  };
}