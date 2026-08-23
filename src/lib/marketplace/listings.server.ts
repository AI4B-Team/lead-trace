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
    matchBreakdown: breakdown as MatchCheck[],
    postedAt: r.posted_at ?? null,
    postedAtReliable: Boolean(r.posted_at_reliable),
    firstSeenAt: r.first_seen_at,
    duplicateGroup: r.duplicate_group ?? null,
    duplicateConfidence: r.duplicate_confidence == null ? null : Number(r.duplicate_confidence),
    dismissedAt: r.dismissed_at ?? null,
    savedAt: r.saved_at ?? null,
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
 * Save a marketplace listing into the workspace Leads library. Contact details
 * are only written when the source actually provided them.
 */
export async function saveListingAsLead(
  supabase: Client,
  id: string,
  workspaceId: string,
): Promise<{ leadId: string }> {
  const { data: row, error } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !row) throw new Error(error?.message ?? "That listing no longer exists.");

  const listing = toRow(row);
  const seller = listing.seller ?? {};
  const { city, state } = splitLocation(listing.locationText);
  const dedupeKey = `marketplace:${listing.source}:${listing.externalId ?? listing.listingUrl}`;

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
        source_meta: {
          marketplace_source: listing.source,
          listing_url: listing.listingUrl,
          match_score: listing.matchScore,
          asking_price: listing.price,
          marketplace_search_id: listing.searchId,
          attributes: listing.attributes,
        },
        last_seen_at: new Date().toISOString(),
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
    .update({ saved_lead_id: lead.id, saved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  return { leadId: lead.id };
}
