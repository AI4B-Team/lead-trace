/**
 * Marketplace Deals persistence. Every read/write goes through the caller's
 * Supabase client so RLS scopes rows to their workspace.
 */
import type { MarketplaceListingRow, MatchCheck } from "./deals.shared";

type Client = { from: (t: string) => any };

export type DealFilters = {
  workspaceId: string;
  searchId?: string | null;
  category?: string | null;
  source?: string | null;
  minScore?: number;
  location?: string | null;
  freshnessHours?: number;
  query?: string | null;
  includeDismissed?: boolean;
  limit?: number;
};

function toRow(r: any): MarketplaceListingRow {
  const breakdown = Array.isArray(r.match_breakdown) ? r.match_breakdown : [];
  return {
    id: r.id,
    searchId: r.search_id ?? null,
    source: r.source,
    externalId: r.external_id ?? null,
    listingUrl: r.listing_url,
    title: r.title,
    description: r.description ?? null,
    price: r.price == null ? null : Number(r.price),
    currency: r.currency ?? "USD",
    category: r.category ?? null,
    locationText: r.location_text ?? null,
    distanceMiles: r.distance_miles == null ? null : Number(r.distance_miles),
    attributes: r.attributes ?? {},
    photos: r.photos ?? [],
    seller: r.seller ?? {},
    matchScore: Number(r.match_score ?? 0),
    matchCriteria: Array.isArray(r.match_criteria) ? r.match_criteria : [],
    attributeConfidence: r.attribute_confidence ?? {},
    sellerSignals: Array.isArray(r.seller_signals) ? r.seller_signals : [],
    marketPosition: (r.market_position ?? "unknown") as MarketplaceListingRow["marketPosition"],
    marketPositionNote: r.market_position_note ?? null,
    disqualifiedReason: r.disqualified_reason ?? null,
    aiAnalysisUsed: Boolean(r.ai_analysis_used),
    analyzedAt: r.analyzed_at ?? null,
    matchBreakdown: breakdown as MatchCheck[],
    postedAt: r.posted_at ?? null,
    postedAtReliable: Boolean(r.posted_at_reliable),
    firstSeenAt: r.first_seen_at,
    duplicateGroup: r.duplicate_group ?? null,
    duplicateConfidence: r.duplicate_confidence == null ? null : Number(r.duplicate_confidence),
    dismissedAt: r.dismissed_at ?? null,
    savedAt: r.saved_at ?? null,
    savedLeadId: r.saved_lead_id ?? null,
    leadCreatedAutomatically: Boolean(r.lead_created_automatically),
    compCount: r.comp_count == null ? null : Number(r.comp_count),
    compConfidence: r.comp_confidence ?? null,
    compsCheckedAt: r.comps_checked_at ?? null,
  };
}

/** Escape PostgREST `or`/`ilike` metacharacters in user-typed search text. */
function safeLike(value: string): string {
  return value.replace(/[,()%\\]/g, " ").trim();
}

export async function listDeals(
  supabase: Client,
  f: DealFilters,
): Promise<MarketplaceListingRow[]> {
  let q = supabase
    .from("marketplace_listings")
    .select("*")
    .eq("workspace_id", f.workspaceId);

  if (!f.includeDismissed) q = q.is("dismissed_at", null);
  if (f.searchId) q = q.eq("search_id", f.searchId);
  if (f.category) q = q.eq("category", f.category);
  if (f.source) q = q.eq("source", f.source);
  if (f.minScore) q = q.gte("match_score", f.minScore);
  if (f.location) {
    const term = safeLike(f.location);
    if (term) q = q.ilike("location_text", `%${term}%`);
  }
  if (f.freshnessHours) {
    const since = new Date(Date.now() - f.freshnessHours * 3600_000).toISOString();
    q = q.gte("first_seen_at", since);
  }
  if (f.query) {
    const term = safeLike(f.query);
    if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { data, error } = await q
    .order("first_seen_at", { ascending: false })
    .limit(Math.min(f.limit ?? 100, 200));
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRow);
}

export async function setDismissed(
  supabase: Client,
  id: string,
  workspaceId: string,
  dismissed: boolean,
): Promise<{ ok: true }> {
  const { error } = await supabase
    .from("marketplace_listings")
    .update({ dismissed_at: dismissed ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Split "Tampa, FL" into city/state without inventing values. */
function splitLocation(text: string | null): { city: string | null; state: string | null } {
  if (!text) return { city: null, state: null };
  const m = text.match(/^(.*?),\s*([A-Za-z]{2})\b/);
  if (m) return { city: m[1].trim() || null, state: m[2].toUpperCase() };
  return { city: text.trim() || null, state: null };
}

/**
 * A marketplace listing maps to exactly one lead in the EXISTING Leads
 * library — there is no separate Marketplace CRM. This key is what keeps a
 * listing from producing two leads no matter how it was saved (by hand, by the
 * opt-in automatic rule, or by a second click on a slow connection).
 */
export function marketplaceDedupeKey(listing: {
  source: string;
  externalId: string | null;
  listingUrl: string;
}): string {
  return `marketplace:${listing.source}:${listing.externalId ?? listing.listingUrl}`;
}

/** One-line, human-readable reason this listing matched the saved search. */
function matchExplanation(listing: MarketplaceListingRow): string {
  const matched = listing.matchCriteria.filter((c) => c.state === "matched").map((c) => c.label);
  const missed = listing.matchCriteria
    .filter((c) => c.state === "not_matched" || c.state === "conflicting")
    .map((c) => c.label);
  const parts: string[] = [];
  if (matched.length) parts.push(`Matched: ${matched.join(", ")}`);
  if (missed.length) parts.push(`Potential Mismatch: ${missed.join(", ")}`);
  return parts.join(" · ");
}

/**
 * Everything marketplace-specific lives in `source_meta`. The universal lead
 * schema never grows a vehicle/electronics/furniture column.
 */
function leadSourceMeta(
  listing: MarketplaceListingRow,
  search: { id: string | null; name: string | null } | null,
  origin: "manual_save" | "auto_above_score",
): Record<string, unknown> {
  return {
    lead_source: "Marketplace Deals",
    marketplace: listing.source,
    marketplace_search_id: search?.id ?? listing.searchId,
    marketplace_search_name: search?.name ?? null,
    marketplace_listing_id: listing.id,
    listing_url: listing.listingUrl,
    listing_title: listing.title,
    item_category: listing.category,
    asking_price: listing.price,
    currency: listing.currency,
    location: listing.locationText,
    distance_miles: listing.distanceMiles,
    description: listing.description,
    images: listing.photos.slice(0, 12),
    seller_name: typeof listing.seller.name === "string" ? listing.seller.name : null,
    // Category-specific facts stay in their own bag, keyed by category.
    attributes: listing.attributes,
    market_position: listing.marketPosition,
    market_position_note: listing.marketPositionNote,
    match_score: listing.matchScore,
    match_explanation: matchExplanation(listing),
    first_seen_at: listing.firstSeenAt,
    // "Posted" is only claimed when the marketplace gave a time we trust.
    posted_at: listing.postedAtReliable ? listing.postedAt : null,
    saved_via: origin,
  };
}

export type SaveLeadResult = {
  leadId: string;
  /** True when this listing was already in the Leads library. */
  alreadyLinked: boolean;
};

/**
 * Save a marketplace listing into the workspace Leads library. Contact details
 * are only written when the source actually provided them, and outreach is
 * never started — this phase ends at "open the original listing".
 */
export async function saveListingAsLead(
  supabase: Client,
  id: string,
  workspaceId: string,
  opts: { origin?: "manual_save" | "auto_above_score" } = {},
): Promise<SaveLeadResult> {
  const origin = opts.origin ?? "manual_save";
  const { data: row, error } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !row) throw new Error(error?.message ?? "That listing no longer exists.");

  // Already linked: hand back the same lead instead of making a second one.
  if (row.saved_lead_id) return { leadId: String(row.saved_lead_id), alreadyLinked: true };

  const listing = toRow(row);
  const seller = listing.seller ?? {};
  const { city, state } = splitLocation(listing.locationText);
  const dedupeKey = marketplaceDedupeKey(listing);

  let search: { id: string | null; name: string | null } | null = null;
  if (listing.searchId) {
    const { data: s } = await supabase
      .from("marketplace_searches")
      .select("id, name")
      .eq("id", listing.searchId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (s) search = { id: String(s.id), name: s.name ?? null };
  }

  // A lead may already exist from an earlier save of the same listing even if
  // this row lost its pointer (re-discovered under a different search).
  const { data: existingLead } = await supabase
    .from("lead_records")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const { data: lead, error: insertError } = await supabase
    .from("lead_records")
    .upsert(
      {
        workspace_id: workspaceId,
        dedupe_key: dedupeKey,
        full_name: typeof seller.name === "string" ? seller.name : null,
        business_name: listing.title,
        phone: typeof seller.phone === "string" ? seller.phone : null,
        email: typeof seller.email === "string" ? seller.email : null,
        address: listing.locationText,
        city,
        state,
        website: listing.listingUrl,
        source_types: ["marketplace"],
        record_types: ["marketplace_deal"],
        data_provenance: "verified_source",
        source_meta: leadSourceMeta(listing, search, origin),
        last_seen_at: nowIso,
      },
      { onConflict: "workspace_id,dedupe_key" },
    )
    .select("id")
    .single();
  if (insertError || !lead) {
    throw new Error(insertError?.message ?? "Could not save this listing as a lead.");
  }

  await supabase
    .from("marketplace_listings")
    .update({
      saved_lead_id: lead.id,
      saved_at: nowIso,
      lead_created_automatically: origin === "auto_above_score",
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  return { leadId: String(lead.id), alreadyLinked: Boolean(existingLead) };
}
