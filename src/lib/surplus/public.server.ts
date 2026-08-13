/**
 * Reads for the PUBLIC surplus funds guide pages.
 *
 * Two rules live in the database, not here, and must not be reimplemented
 * loosely in this file:
 *   1. Public pages carry clerk-confirmed records only. A derived amount is our
 *      own arithmetic on an auction result; publishing it would assert that a
 *      named stranger is owed a specific sum. Derived stays behind the paywall.
 *   2. A state or county page only exists once its editorial row is published,
 *      which the schema refuses without authored prose and a verification date.
 *
 * Everything below reads `surplus_records_public` through the aggregate
 * functions, so neither rule can be bypassed from application code.
 */

export type SurplusStateRules = {
  state: string;
  primary_term: string;
  term_aliases: string[];
  clerk_title: string;
  overview_md: string;
  owner_record_date: string | null;
  last_verified_at: string | null;
  notes: string | null;
  fee_cap_percent: number | null;
  fee_cap_citation: string | null;
  claim_window_days: number | null;
  escheat_window_days: number | null;
  escheat_destination: string | null;
  assignment_permitted: boolean | null;
  recovery_permitted: boolean;
};

export type SurplusAggregate = {
  total_amount: number;
  record_count: number;
  county_count?: number;
  by_sale_type: Record<string, number>;
  data_as_of: string | null;
  min_sale_date: string | null;
  max_sale_date: string | null;
};

export type SurplusCountyRow = {
  county_fips: string;
  county_name: string;
  county_slug: string;
  clerk_office_name: string | null;
  official_list_url: string | null;
  record_count: number;
  total_amount: number;
  verified_at: string | null;
};

export type SurplusFaq = { question: string; answer_md: string };

const EMPTY_AGGREGATE: SurplusAggregate = {
  total_amount: 0,
  record_count: 0,
  by_sale_type: {},
  data_as_of: null,
  min_sale_date: null,
  max_sale_date: null,
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function toAggregate(row: Record<string, unknown> | null): SurplusAggregate {
  if (!row) return EMPTY_AGGREGATE;
  return {
    total_amount: num(row["total_amount"]),
    record_count: num(row["record_count"]),
    county_count: row["county_count"] === undefined ? undefined : num(row["county_count"]),
    by_sale_type: (row["by_sale_type"] as Record<string, number>) ?? {},
    data_as_of: (row["data_as_of"] as string | null) ?? null,
    min_sale_date: (row["min_sale_date"] as string | null) ?? null,
    max_sale_date: (row["max_sale_date"] as string | null) ?? null,
  };
}

/**
 * Editorial row + statewide law. Returns null when the state is unpublished,
 * which the routes turn into a 404 rather than an empty page.
 */
export async function getStateRules(state: string): Promise<SurplusStateRules | null> {
  const db = await admin();
  const { data: page } = await db
    .from("surplus_state_pages")
    .select("*")
    .eq("state", state)
    .eq("published", true)
    .maybeSingle();
  if (!page) return null;
  const p = page as Record<string, unknown>;

  // Statutory fields come from the verified statute rows. Tax deed wins when a
  // state publishes both, because it is the larger surplus population.
  const { data: statutes } = await db
    .from("surplus_statutes")
    .select("*")
    .eq("state", state)
    .eq("published", true);
  const rows = (statutes ?? []) as Record<string, unknown>[];
  const law = rows.find((r) => r["sale_kind"] === "tax_deed") ?? rows[0] ?? null;

  return {
    state,
    primary_term: String(p["primary_term"]),
    term_aliases: (p["term_aliases"] as string[]) ?? [],
    clerk_title: String(p["clerk_title"]),
    overview_md: String(p["overview_md"]),
    owner_record_date: (p["owner_record_date"] as string | null) ?? null,
    last_verified_at: (p["last_verified_at"] as string | null) ?? null,
    notes: (p["notes"] as string | null) ?? null,
    fee_cap_percent: law?.["fee_cap_pct"] == null ? null : num(law["fee_cap_pct"]),
    fee_cap_citation: (law?.["statute_citation"] as string | null) ?? null,
    claim_window_days: law?.["claim_window_days"] == null ? null : num(law["claim_window_days"]),
    escheat_window_days: law?.["escheat_days"] == null ? null : num(law["escheat_days"]),
    escheat_destination: (law?.["escheat_destination"] as string | null) ?? null,
    assignment_permitted: (law?.["assignment_permitted"] as boolean | null) ?? null,
    recovery_permitted: (law?.["recovery_permitted"] as boolean | null) ?? true,
  };
}

export async function stateAggregate(state: string): Promise<SurplusAggregate> {
  const db = await admin();
  const { data } = await db.rpc("surplus_public_state_aggregate" as never, {
    p_state: state,
  } as never);
  const row = Array.isArray(data) ? (data[0] ?? null) : (data as Record<string, unknown> | null);
  return toAggregate(row as Record<string, unknown> | null);
}

export async function countyAggregate(fips: string): Promise<SurplusAggregate> {
  const db = await admin();
  const { data } = await db.rpc("surplus_public_county_aggregate" as never, {
    p_county_fips: fips,
  } as never);
  const row = Array.isArray(data) ? (data[0] ?? null) : (data as Record<string, unknown> | null);
  return toAggregate(row as Record<string, unknown> | null);
}

export async function stateCounties(state: string): Promise<SurplusCountyRow[]> {
  const db = await admin();
  const { data } = await db.rpc("surplus_public_state_counties" as never, {
    p_state: state,
  } as never);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    county_fips: String(r["county_fips"]),
    county_name: String(r["county_name"]),
    county_slug: String(r["county_slug"]),
    clerk_office_name: (r["clerk_office_name"] as string | null) ?? null,
    official_list_url: (r["official_list_url"] as string | null) ?? null,
    record_count: num(r["record_count"]),
    total_amount: num(r["total_amount"]),
    verified_at: (r["verified_at"] as string | null) ?? null,
  }));
}

export type SurplusCountyPage = {
  fips: string;
  slug: string;
  name: string;
  clerkOfficeName: string | null;
  clerkAddress: string[];
  clerkPhone: string | null;
  officialListUrl: string | null;
  claimProcessMd: string | null;
  verifiedAt: string | null;
};

export async function getCountyPage(
  state: string,
  slug: string,
): Promise<SurplusCountyPage | null> {
  const db = await admin();
  const { data } = await db
    .from("surplus_county_pages")
    .select("*")
    .eq("state", state)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const cityLine = [r["clerk_city"], r["clerk_postal_code"]].filter(Boolean).join(" ");
  return {
    fips: String(r["county_fips"]),
    slug: String(r["slug"]),
    name: String(r["county_name"]),
    clerkOfficeName: (r["clerk_office_name"] as string | null) ?? null,
    clerkAddress: [r["clerk_address_line1"], r["clerk_address_line2"], cityLine]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0),
    clerkPhone: (r["clerk_phone"] as string | null) ?? null,
    officialListUrl: (r["official_list_url"] as string | null) ?? null,
    claimProcessMd: (r["claim_process_md"] as string | null) ?? null,
    verifiedAt: (r["verified_at"] as string | null) ?? null,
  };
}

export async function nearbyCounties(fips: string, limit = 3) {
  const db = await admin();
  const { data } = await db.rpc("surplus_public_nearby_counties" as never, {
    p_county_fips: fips,
    p_limit: limit,
  } as never);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    slug: String(r["county_slug"]),
    name: String(r["county_name"]),
    recordCount: num(r["record_count"]),
    totalAmount: num(r["total_amount"]),
  }));
}

/** Published FAQs. County pages get county-specific plus statewide questions. */
export async function listFaqs(state: string, fips: string | null): Promise<SurplusFaq[]> {
  const db = await admin();
  let q = db
    .from("surplus_faqs")
    .select("question, answer_md, county_fips, sort_order")
    .eq("state", state)
    .eq("published", true)
    .order("sort_order", { ascending: true });
  q = fips ? q.or(`county_fips.is.null,county_fips.eq.${fips}`) : q.is("county_fips", null);
  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    question: String(r["question"]),
    answer_md: String(r["answer_md"]),
  }));
}

/** Sitemap source. A URL missing from here must not be in the sitemap. */
export async function publishedSurplusUrls() {
  const db = await admin();
  const { data } = await db.rpc("surplus_public_urls" as never, {} as never);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    state: String(r["state_code"]),
    countySlug: (r["county_slug"] as string | null) ?? null,
    lastModified: (r["last_modified"] as string | null) ?? null,
  }));
}

export type SurplusStateCoverage = {
  state: string;
  primaryTerm: string;
  recordCount: number;
  totalAmount: number;
  countyPages: number;
  countiesWithRecords: number;
  dataAsOf: string | null;
  lastVerifiedAt: string | null;
};

/**
 * Coverage roll-up for the dedicated Surplus Funds hub. Derived from the same
 * published-state gate and clerk-confirmed aggregates as the guide pages, so
 * the hub can never advertise coverage a state page would not honour.
 */
export async function surplusCoverage(): Promise<SurplusStateCoverage[]> {
  const urls = await publishedSurplusUrls();
  const states = [...new Set(urls.map((u) => u.state.toUpperCase()))];
  const rows = await Promise.all(
    states.map(async (state) => {
      const [rules, aggregate, counties] = await Promise.all([
        getStateRules(state),
        stateAggregate(state),
        stateCounties(state),
      ]);
      if (!rules) return null;
      return {
        state,
        primaryTerm: rules.primary_term,
        recordCount: aggregate.record_count,
        totalAmount: aggregate.total_amount,
        countyPages: counties.length,
        countiesWithRecords: counties.filter((c) => c.record_count > 0).length,
        dataAsOf: aggregate.data_as_of,
        lastVerifiedAt: rules.last_verified_at,
      } satisfies SurplusStateCoverage;
    }),
  );
  return rows
    .filter((r): r is SurplusStateCoverage => r !== null)
    .sort((a, b) => b.recordCount - a.recordCount || a.state.localeCompare(b.state));
}