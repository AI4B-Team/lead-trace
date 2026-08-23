/**
 * Comparable Listings engine. Comps only ever come from listing data LeadTrace
 * actually holds — no model is allowed to invent a value, an ARV or a profit.
 * Results are cached per normalized item identity + location + radius, because
 * comp gathering is expensive and identical requests must not repeat.
 */
import type { MarketplaceCategory } from "./catalog.shared";
import {
  compCacheKey, rankComps, summarizeComps,
  type Comp, type CompCandidate, type CompSubject, type CompsSummary,
} from "./comps.shared";
import { COMP_SOURCES, liveCompSources } from "./comp-sources.shared";

type Client = { from: (t: string) => any };

export type CompsResult = {
  subject: CompSubject;
  summary: CompsSummary;
  comps: Comp[];
  compSources: { key: string; label: string; status: "live" | "planned"; note: string }[];
  computedAt: string;
  cached: boolean;
};

const CACHE_TTL_MS = 3 * 24 * 3600_000;
const CANDIDATE_LIMIT = 300;

function subjectFromListing(row: any, radiusMiles: number | null): CompSubject {
  return {
    title: row.title,
    price: row.price == null ? null : Number(row.price),
    category: (row.category ?? "other") as MarketplaceCategory,
    locationText: row.location_text ?? null,
    distanceMiles: row.distance_miles == null ? null : Number(row.distance_miles),
    attributes: (row.attributes ?? {}) as Record<string, string | number>,
    radiusMiles,
  };
}

/**
 * Candidate comps from the workspace's own observed listings. The subject and
 * anything in its duplicate group are excluded so a relisting of the same item
 * can never comp itself.
 */
async function observedCandidates(
  supabase: Client,
  workspaceId: string,
  subjectRow: any,
): Promise<CompCandidate[]> {
  let q = supabase
    .from("marketplace_listings")
    .select(
      "id, source, listing_url, title, price, category, location_text, distance_miles, attributes, posted_at, first_seen_at, duplicate_group",
    )
    .eq("workspace_id", workspaceId)
    .not("price", "is", null)
    .neq("id", subjectRow.id)
    .order("first_seen_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);
  if (subjectRow.category) q = q.eq("category", subjectRow.category);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter(
    (r: any) =>
      !subjectRow.duplicate_group || r.duplicate_group !== subjectRow.duplicate_group,
  );

  const source = COMP_SOURCES[0];
  return rows.map((r: any) => ({
    id: r.id,
    source: source.key,
    sourceLabel: source.label,
    sourceKind: source.kind,
    listingUrl: r.listing_url ?? null,
    title: r.title,
    price: r.price == null ? null : Number(r.price),
    priceKind: source.priceKind,
    observedAt: r.posted_at ?? r.first_seen_at ?? null,
    locationText: r.location_text ?? null,
    distanceMiles: r.distance_miles == null ? null : Number(r.distance_miles),
    attributes: (r.attributes ?? {}) as Record<string, string | number>,
  }));
}

function sourcePanel(category: MarketplaceCategory) {
  return COMP_SOURCES.filter((s) => !s.categories || s.categories.includes(category)).map((s) => ({
    key: s.key,
    label: s.label,
    status: s.status,
    note: s.note,
  }));
}

/** Read a cached run when it is still fresh. */
export async function readCachedComps(
  supabase: Client,
  workspaceId: string,
  listingId: string,
): Promise<CompsResult | null> {
  const { data, error } = await supabase
    .from("marketplace_comp_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("listing_id", listingId)
    .gt("expires_at", new Date().toISOString())
    .order("computed_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const run = data[0];
  return {
    subject: run.subject as CompSubject,
    summary: run.summary as CompsSummary,
    comps: (run.comps ?? []) as Comp[],
    compSources: sourcePanel((run.category ?? "other") as MarketplaceCategory),
    computedAt: run.computed_at,
    cached: true,
  };
}

/**
 * Compute comps for one stored listing, reusing a fresh cached run unless the
 * caller explicitly asked to refresh.
 */
export async function checkComps(
  supabase: Client,
  workspaceId: string,
  listingId: string,
  opts: { refresh?: boolean } = {},
): Promise<CompsResult> {
  if (!opts.refresh) {
    const cached = await readCachedComps(supabase, workspaceId, listingId);
    if (cached) return cached;
  }

  const { data: row, error } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", listingId)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !row) throw new Error(error?.message ?? "That listing no longer exists.");

  let radiusMiles: number | null = null;
  if (row.search_id) {
    const { data: search } = await supabase
      .from("marketplace_searches")
      .select("radius_miles")
      .eq("id", row.search_id)
      .maybeSingle();
    radiusMiles = search?.radius_miles == null ? null : Number(search.radius_miles);
  }

  const subject = subjectFromListing(row, radiusMiles);
  const category = subject.category;

  // Only live comp sources contribute. Planned ones are shown in the UI as
  // future coverage, never as if they returned data.
  const candidates: CompCandidate[] = [];
  const used: string[] = [];
  for (const source of liveCompSources(category)) {
    if (source.key === "leadtrace_observed") {
      candidates.push(...(await observedCandidates(supabase, workspaceId, row)));
      used.push(source.key);
    }
  }

  const comps = rankComps(subject, candidates);
  const summary = summarizeComps(subject, comps);
  const computedAt = new Date().toISOString();

  await supabase.from("marketplace_comp_runs").upsert(
    {
      workspace_id: workspaceId,
      listing_id: listingId,
      cache_key: compCacheKey(subject),
      category,
      subject,
      summary,
      // Cap the stored payload: the drawer shows the strongest evidence first.
      comps: comps.slice(0, 40),
      comps_found: comps.length,
      usable_count: summary.usableCount,
      confidence: summary.confidence,
      comp_sources: used,
      computed_at: computedAt,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    },
    { onConflict: "workspace_id,cache_key" },
  );

  await supabase
    .from("marketplace_listings")
    .update({
      comp_count: comps.length,
      comp_confidence: summary.confidence,
      comp_summary: summary,
      comps_checked_at: computedAt,
    })
    .eq("id", listingId)
    .eq("workspace_id", workspaceId);

  return {
    subject,
    summary,
    comps: comps.slice(0, 40),
    compSources: sourcePanel(category),
    computedAt,
    cached: false,
  };
}
