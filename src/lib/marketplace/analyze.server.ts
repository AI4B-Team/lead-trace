/**
 * Marketplace Deals — matching & analysis pipeline.
 *
 * Sequence, cheapest step first so money is never spent on a listing that is
 * already disqualified:
 *
 *   1. Normalize the source listing
 *   2. Check duplicate / freshness state (already-analyzed rows are skipped)
 *   3. Apply deterministic filters (hard disqualifiers)
 *   4. Extract category-specific attributes without AI
 *   5. Call AI only for attributes step 4 could not resolve
 *   6. Calculate the Match Score
 *   7. Store the match explanation
 *   8. Mark alert-eligible only when the search's minimum Match Score is met
 *
 * Market position is stored alongside the score but never mixed into it: with
 * no comparable-sales dataset for consumer goods, it stays `unknown`.
 */
import type { MarketplaceCategory } from "./catalog.shared";
import { extractDeterministic, extractSellerSignals } from "./extract.shared";
import { extractWithAi } from "./extract.server";
import {
  DEFAULT_MIN_MATCH_SCORE, evaluateMatch, meetsThreshold, prefilter,
  unresolvedCriteriaKeys,
  type ExtractedAttributes, type MarketPosition, type MatchCriterion,
  type MatchSearchSpec, type NormalizedListing, type SellerSignal,
} from "./match.shared";
import { EMPTY_CRITERIA } from "./catalog.shared";
import { canonicalListingUrl } from "./adapters/contract.shared";

/** Bump when scoring or extraction changes so stale rows can be re-analyzed. */
export const ANALYSIS_VERSION = 1;

type Client = { from: (t: string) => any };

/** A listing as handed over by a collector, before any of our processing. */
export type SourceListing = {
  source: string;
  externalId: string | null;
  listingUrl: string;
  title: string;
  description: string | null;
  price: number | null;
  currency?: string | null;
  category?: string | null;
  locationText: string | null;
  distanceMiles: number | null;
  /** Structured fields the marketplace itself exposed. Trusted at high confidence. */
  attributes?: Record<string, string | number>;
  photos?: string[];
  seller?: Record<string, string | boolean | number>;
  postedAt?: string | null;
  postedAtReliable?: boolean;
  /** Map coordinates, only when the source publishes them. */
  latitude?: number | null;
  longitude?: number | null;
  /** Publicly displayed seller name, when the source exposes one. */
  sellerName?: string | null;
  /** Source-specific leftovers, kept for provenance only. */
  sourceMetadata?: Record<string, unknown>;
  duplicateGroup?: string | null;
  duplicateConfidence?: number | null;
};


export type AnalysisOutput = {
  score: number;
  criteria: MatchCriterion[];
  attributes: Record<string, string | number>;
  attributeConfidence: Record<string, string>;
  sellerSignals: SellerSignal[];
  marketPosition: MarketPosition;
  marketPositionNote: string | null;
  disqualifiedReason: string | null;
  aiUsed: boolean;
  alertEligible: boolean;
};

export type AnalyzableSearch = {
  id?: string;
  category: string;
  criteria: MatchSearchSpec["criteria"];
  radiusMiles: number | null;
  minMatchScore?: number | null;
};

function normalizeSpec(search: AnalyzableSearch): MatchSearchSpec {
  return {
    category: (search.category || "other") as MarketplaceCategory,
    criteria: { ...EMPTY_CRITERIA, ...(search.criteria ?? {}) },
    radiusMiles: search.radiusMiles ?? null,
  };
}

/** Step 1 — normalize, without inventing anything the source didn't give us. */
export function normalizeListing(
  listing: SourceListing,
  category: MarketplaceCategory,
  attributes: ExtractedAttributes,
  sellerSignals: SellerSignal[],
): NormalizedListing {
  return {
    title: (listing.title ?? "").trim(),
    description: listing.description?.trim() || null,
    price: listing.price == null ? null : Number(listing.price),
    category,
    locationText: listing.locationText?.trim() || null,
    distanceMiles: listing.distanceMiles == null ? null : Number(listing.distanceMiles),
    attributes,
    sellerSignals,
  };
}

/**
 * Steps 1–8 for a single listing against a single search. Pure apart from the
 * optional AI call, so it can be unit tested with `allowAi: false`.
 */
export async function analyzeListing(
  listing: SourceListing,
  search: AnalyzableSearch,
  options: { allowAi?: boolean } = {},
): Promise<AnalysisOutput> {
  const spec = normalizeSpec(search);
  const category = spec.category;
  const minScore = search.minMatchScore ?? DEFAULT_MIN_MATCH_SCORE;

  // 3 — deterministic gate on the raw text, before extraction or AI.
  const rough = normalizeListing(listing, category, {}, []);
  const gate = prefilter(rough, spec);

  // 4 — free extraction.
  let attrs = extractDeterministic(
    category,
    listing.title ?? "",
    listing.description ?? null,
    listing.attributes ?? {},
  );
  let signals: SellerSignal[] = extractSellerSignals(listing.title ?? "", listing.description ?? null);
  let aiUsed = false;

  // 5 — AI only when a user criterion is still unresolved AND the listing is
  // not already disqualified. Disqualified listings never cost a model call.
  if (!gate.disqualified && options.allowAi !== false) {
    const need = unresolvedCriteriaKeys(spec, attrs);
    if (need.length) {
      const ai = await extractWithAi({
        category,
        title: listing.title ?? "",
        description: listing.description ?? null,
        needKeys: need,
      });
      if (!ai.degraded) {
        aiUsed = true;
        // Deterministic values win: they came from the source, not a model.
        attrs = { ...ai.attributes, ...attrs };
        const seen = new Set(signals.map((s) => s.key));
        signals = [...signals, ...ai.sellerSignals.filter((s) => !seen.has(s.key))];
      }
    }
  }

  // 6 — score.
  const normalized = normalizeListing(listing, category, attrs, signals);
  const result = evaluateMatch(normalized, spec);
  const score = gate.disqualified ? Math.min(result.score, 40) : result.score;

  const attributes: Record<string, string | number> = {};
  const attributeConfidence: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    attributes[k] = v.value;
    attributeConfidence[k] = v.confidence;
  }

  return {
    score,
    criteria: result.criteria,
    attributes,
    attributeConfidence,
    sellerSignals: signals,
    // Independent of the Match Score, and honest: we have no comps dataset.
    marketPosition: "unknown",
    marketPositionNote: "LeadTrace Does Not Price Consumer Marketplace Goods. Use Check Comps.",
    disqualifiedReason: gate.reason,
    aiUsed,
    alertEligible: !gate.disqualified && meetsThreshold(score, minScore),
  };
}

/**
 * Step 2 + persistence. Upserts the listing for a search and stores the match
 * explanation. Existing rows keep their `first_seen_at` so freshness stays true,
 * and are only re-analyzed when the analysis version moved.
 */
export async function analyzeAndStoreListing(
  supabase: Client,
  workspaceId: string,
  listing: SourceListing,
  search: AnalyzableSearch & { id: string },
  options: { allowAi?: boolean; force?: boolean } = {},
): Promise<{ stored: boolean; listingId: string | null; analysis: AnalysisOutput | null; skipped?: string }> {
  // Must match monitor.server.ts `identity()` exactly: the source's own id when
  // present, otherwise the tracking-stripped canonical URL. Using the raw URL
  // here made the "already seen" lookup miss, so listings without an external id
  // were re-alerted as new on every check.
  const externalKey = (listing.externalId?.trim() || canonicalListingUrl(listing.listingUrl || "")).trim();

  const { data: existing } = await supabase
    .from("marketplace_listings")
    .select("id, analysis_version, first_seen_at")
    .eq("workspace_id", workspaceId)
    .eq("search_id", search.id)
    .eq("source", listing.source)
    .eq("external_id", externalKey)
    .maybeSingle();

  if (existing && !options.force && Number(existing.analysis_version) >= ANALYSIS_VERSION) {
    return { stored: false, listingId: existing.id, analysis: null, skipped: "already_analyzed" };
  }

  const analysis = await analyzeListing(listing, search, options);
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    search_id: search.id,
    source: listing.source,
    external_id: externalKey,
    listing_url: listing.listingUrl,
    title: listing.title,
    description: listing.description ?? null,
    price: listing.price ?? null,
    currency: listing.currency ?? "USD",
    category: listing.category ?? search.category,
    location_text: listing.locationText ?? null,
    distance_miles: listing.distanceMiles ?? null,
    attributes: analysis.attributes,
    attribute_confidence: analysis.attributeConfidence,
    seller_signals: analysis.sellerSignals,
    photos: listing.photos ?? [],
    seller: listing.seller ?? {},
    match_score: analysis.score,
    match_criteria: analysis.criteria,
    // Legacy compact breakdown kept in sync for older rendering paths.
    match_breakdown: analysis.criteria
      .filter((c) => c.fromCriteria)
      .map((c) => ({ label: c.label, ok: c.state === "matched", note: c.detail ?? null })),
    market_position: analysis.marketPosition,
    market_position_note: analysis.marketPositionNote,
    disqualified_reason: analysis.disqualifiedReason,
    analysis_version: ANALYSIS_VERSION,
    analyzed_at: now,
    ai_analysis_used: analysis.aiUsed,
    posted_at: listing.postedAt ?? null,
    posted_at_reliable: Boolean(listing.postedAtReliable),
    duplicate_group: listing.duplicateGroup ?? null,
    duplicate_confidence: listing.duplicateConfidence ?? null,
    // 8 — only alert-eligible listings get a timestamp; the notifier reads this.
    alerted_at: analysis.alertEligible ? now : null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .update(payload)
      .eq("id", existing.id)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not store this listing analysis.");
    return { stored: true, listingId: data.id, analysis };
  }

  const { data, error } = await supabase
    .from("marketplace_listings")
    .insert({ ...payload, first_seen_at: now })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not store this listing analysis.");
  return { stored: true, listingId: data.id, analysis };
}

/** Re-run analysis for a stored listing (used after criteria edits). */
export async function reanalyzeStoredListing(
  supabase: Client,
  workspaceId: string,
  listingId: string,
): Promise<AnalysisOutput> {
  const { data: row, error } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", listingId)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !row) throw new Error(error?.message ?? "That listing no longer exists.");

  if (!row.search_id) throw new Error("This listing is not linked to a marketplace search.");
  const { data: search, error: searchError } = await supabase
    .from("marketplace_searches")
    .select("id, category, criteria, radius_miles, min_match_score")
    .eq("id", row.search_id)
    .eq("workspace_id", workspaceId)
    .single();
  if (searchError || !search) {
    throw new Error(searchError?.message ?? "The marketplace search for this listing is gone.");
  }

  const result = await analyzeAndStoreListing(
    supabase,
    workspaceId,
    {
      source: row.source,
      externalId: row.external_id,
      listingUrl: row.listing_url,
      title: row.title,
      description: row.description,
      price: row.price == null ? null : Number(row.price),
      currency: row.currency,
      category: row.category,
      locationText: row.location_text,
      distanceMiles: row.distance_miles == null ? null : Number(row.distance_miles),
      photos: row.photos ?? [],
      seller: row.seller ?? {},
      postedAt: row.posted_at,
      postedAtReliable: row.posted_at_reliable,
      duplicateGroup: row.duplicate_group,
      duplicateConfidence: row.duplicate_confidence,
    },
    {
      id: search.id,
      category: search.category,
      criteria: search.criteria ?? EMPTY_CRITERIA,
      radiusMiles: search.radius_miles ?? null,
      minMatchScore: search.min_match_score ?? null,
    },
    { force: true },
  );
  if (!result.analysis) throw new Error("Analysis did not run for this listing.");
  return result.analysis;
}
