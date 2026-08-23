/**
 * Marketplace source adapter — Facebook Marketplace.
 *
 * WHAT THIS FILE OWNS: what a Facebook Marketplace search looks like (the
 * public search URL), what its records look like (field names), and how they
 * normalize into `AdapterListing`. It performs NO retrieval itself — it asks
 * the collection provider registry, so it does not know or care whether Bright
 * Data, Apify or a future first-party collector did the work.
 *
 * STATUS: NOT LIVE. The catalog entry stays `planned` and this adapter is not
 * registered until a real end-to-end collection has been run and its records
 * verified against the normalizer. `verifyFacebookCollection()` below is the
 * proof-of-concept path an operator runs to earn that flip.
 *
 * Field names below come from the collection job's published output contract
 * (list mode). Detail-mode fields (description, coordinates, posting time) are
 * read defensively from candidate keys and are NOT claimed as capabilities
 * until a real detail run confirms them — a capability we cannot demonstrate is
 * a capability we do not advertise.
 */
import {
  buildAdapterListing, sourceHealth, validateAgainstProfile,
  type AdapterListing, type SourceHealth, type SourceProfile,
} from "./contract.shared";
import type { AdapterSearch, AdapterSearchResult, MarketplaceSourceAdapter } from "./registry.server";
import { collectFor, providerForSource } from "../providers/registry.server";
import { CollectionProviderError, providerErrorMessage } from "../providers/contract.shared";

const MAX_LISTINGS_PER_CHECK = 60;

/** Radius values the public search URL accepts, in kilometres. */
function radiusKm(miles: number | null | undefined): number | null {
  if (!miles || !Number.isFinite(miles)) return null;
  return Math.max(1, Math.round(miles * 1.60934));
}

/** Location text -> the city slug the public marketplace URL uses. */
export function locationSlug(location: string | null | undefined): string | null {
  const city = (location ?? "").split(",")[0]?.trim().toLowerCase();
  if (!city) return null;
  const slug = city.replace(/[^a-z0-9]+/g, "");
  return slug || null;
}

/**
 * Build the public search URL for a search. Keyword and price filters are the
 * marketplace's own documented query parameters; sorting by newest is what makes
 * the fast path fast.
 */
export function buildSearchUrl(search: AdapterSearch): string | null {
  const slug = locationSlug(search.location);
  if (!slug) return null;
  const terms = [...(search.criteria.targets ?? []), ...(search.criteria.keywords ?? [])]
    .map((t) => t.trim())
    .filter(Boolean);
  const params = new URLSearchParams();
  if (terms.length) params.set("query", terms.join(" "));
  if (search.criteria.priceMin != null) params.set("minPrice", String(Math.round(search.criteria.priceMin)));
  if (search.criteria.priceMax != null) params.set("maxPrice", String(Math.round(search.criteria.priceMax)));
  const km = radiusKm(search.radiusMiles);
  if (km) params.set("radius", String(km));
  params.set("sortBy", "creation_time_descend");
  return `https://www.facebook.com/marketplace/${slug}/search/?${params.toString()}`;
}

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pick(record: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = record;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor ?? null;
}

/** One raw collection record -> normalized listing, or null when unusable. */
export function normalizeFacebookRecord(raw: unknown): AdapterListing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Sold / hidden / pending items are not opportunities; drop before anything else.
  if (r["is_sold"] === true || r["is_hidden"] === true || r["is_live"] === false) return null;

  const id = firstString(r["id"], r["listing_id"]);
  const url =
    firstString(r["listingUrl"], r["listing_url"], r["url"]) ??
    (id ? `https://www.facebook.com/marketplace/item/${id}` : null);
  if (!url) return null;

  const title = firstString(
    r["marketplace_listing_title"],
    r["custom_title"],
    r["title"],
  );
  if (!title) return null;

  const price =
    firstString(pick(r, ["listing_price", "amount"]), pick(r, ["listing_price", "formatted_amount"]), r["price"]) ??
    null;

  const city = firstString(pick(r, ["location", "reverse_geocode", "city"]));
  const state = firstString(pick(r, ["location", "reverse_geocode", "state"]));
  const location =
    firstString(pick(r, ["location", "reverse_geocode", "city_page", "display_name"])) ??
    [city, state].filter(Boolean).join(", ") ||
    null;

  const image = firstString(pick(r, ["primary_listing_photo", "image", "uri"]));
  const images = Array.isArray(r["listing_photos"])
    ? (r["listing_photos"] as unknown[])
        .map((p) => firstString(pick((p ?? {}) as Record<string, unknown>, ["image", "uri"]), p))
        .filter(Boolean)
    : [];

  return buildAdapterListing("facebook", {
    sourceListingId: id,
    sourceUrl: url,
    title,
    // Detail-mode only; absent in list mode and therefore usually null.
    description: firstString(r["redacted_description"], pick(r, ["redacted_description", "text"]), r["description"]),
    price,
    currency: firstString(pick(r, ["listing_price", "currency"])) ?? "USD",
    location,
    latitude: pick(r, ["location", "latitude"]) ?? r["latitude"],
    longitude: pick(r, ["location", "longitude"]) ?? r["longitude"],
    sellerName: firstString(pick(r, ["marketplace_listing_seller", "name"])),
    sellerMetadata: {
      ...(firstString(pick(r, ["marketplace_listing_seller", "id"]))
        ? { sellerId: firstString(pick(r, ["marketplace_listing_seller", "id"]))! }
        : {}),
      ...(firstString(pick(r, ["marketplace_listing_seller", "__typename"]))
        ? { sellerType: firstString(pick(r, ["marketplace_listing_seller", "__typename"]))! }
        : {}),
      ...(Array.isArray(r["delivery_types"]) ? { delivery: (r["delivery_types"] as unknown[]).join(",") } : {}),
    },
    images: images.length ? images : image ? [image] : [],
    sourcePostedAt: r["creation_time"] ?? r["created_time"] ?? null,
    sourcePostedAtReliable: false,
    rawSourceMetadata: {
      searchUrl: firstString(r["facebookUrl"], r["search_url"]),
      categoryId: firstString(r["marketplace_listing_category_id"]),
    },
  });
}

/* ------------------------------------------------------------------ *
 * Adapter
 * ------------------------------------------------------------------ */

export const facebookProfile: SourceProfile = {
  source: "facebook",
  // Only capabilities the collection contract demonstrably supports today.
  capabilities: [
    "search",
    "keyword_query",
    "price_filter",
    "location_radius",
    "seller_metadata",
    "images",
    "pagination",
  ],
  categories: [],
  // Managed collection is metered and rate-sensitive: two minutes is the floor.
  minCheckIntervalSeconds: 120,
  maxListingsPerCheck: MAX_LISTINGS_PER_CHECK,
  accessModel:
    "Public marketplace search results retrieved through a managed collection provider under our own account.",
  requiresCredentials: true,
};

export const facebookAdapter: MarketplaceSourceAdapter = {
  source: "facebook",
  profile: facebookProfile,

  validateSearch(search) {
    const base = validateAgainstProfile(facebookProfile, search);
    if (!buildSearchUrl(search)) {
      return {
        ok: false,
        errors: ["Add a city so this marketplace knows where to look."],
        unsupported: base.unsupported,
      };
    }
    return base;
  },

  async searchListings(search): Promise<AdapterSearchResult> {
    const target = buildSearchUrl(search);
    if (!target) throw new Error("Add a city so this marketplace knows where to look.");

    try {
      const result = await collectFor("facebook", {
        source: "facebook",
        searchId: search.id,
        targets: [target],
        maxRecords: MAX_LISTINGS_PER_CHECK,
        // Detail mode costs more per record; the fast path does not need it.
        wantDetail: false,
      });
      const listings: AdapterListing[] = [];
      for (const raw of result.records) {
        const listing = normalizeFacebookRecord(raw);
        if (listing) listings.push(listing);
      }
      return {
        listings,
        rateLimited: result.rateLimited,
        ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
        truncated: result.truncated,
        note: result.note,
      };
    } catch (err) {
      if (err instanceof CollectionProviderError) {
        throw new Error(providerErrorMessage(err.category));
      }
      throw err;
    }
  },

  normalizeListing: normalizeFacebookRecord,

  getSourceMetadata() {
    const provider = providerForSource("facebook");
    return {
      collectionProvider: provider?.key ?? "none",
      verifiedEndToEnd: false,
      maxListingsPerCheck: MAX_LISTINGS_PER_CHECK,
    };
  },

  async healthCheck(): Promise<SourceHealth> {
    const provider = providerForSource("facebook");
    if (!provider) return sourceHealth("config_required", "No collection provider is configured for Facebook.");
    const health = await provider.healthCheck();
    if (health.key === "healthy") return sourceHealth("healthy", health.detail);
    if (health.key === "degraded") return sourceHealth("delayed", health.detail);
    if (health.key === "not_configured") return sourceHealth("config_required", health.detail);
    return sourceHealth("unavailable", health.detail);
  },
};

/* ------------------------------------------------------------------ *
 * Proof of concept
 * ------------------------------------------------------------------ */

/**
 * Operator PoC: run ONE real collection and report what normalization produced,
 * without storing anything. This is the gate for marking the source live — the
 * catalog entry stays `planned` until this returns real, well-formed listings.
 */
export async function verifyFacebookCollection(input: {
  location: string;
  keywords?: string[];
  priceMax?: number | null;
  radiusMiles?: number | null;
  limit?: number;
}): Promise<{
  ok: boolean;
  provider: string | null;
  target: string | null;
  recordsReturned: number;
  listingsNormalized: number;
  withPrice: number;
  withLocation: number;
  withImages: number;
  withPostedTime: number;
  sample: AdapterListing[];
  error?: string;
  errorCategory?: string;
}> {
  const search: AdapterSearch = {
    id: "poc",
    category: "general",
    criteria: {
      targets: input.keywords ?? [],
      keywords: [],
      exclusions: [],
      priceMin: null,
      priceMax: input.priceMax ?? null,
      attributes: {},
    },
    location: input.location,
    radiusMiles: input.radiusMiles ?? null,
  };
  const target = buildSearchUrl(search);
  const provider = providerForSource("facebook");
  if (!target) {
    return {
      ok: false, provider: provider?.key ?? null, target: null, recordsReturned: 0,
      listingsNormalized: 0, withPrice: 0, withLocation: 0, withImages: 0, withPostedTime: 0,
      sample: [], error: "A city is required.", errorCategory: "bad_request",
    };
  }
  try {
    const result = await collectFor("facebook", {
      source: "facebook",
      searchId: "poc",
      targets: [target],
      maxRecords: Math.max(1, Math.min(input.limit ?? 10, MAX_LISTINGS_PER_CHECK)),
      wantDetail: true,
    });
    const listings = result.records
      .map(normalizeFacebookRecord)
      .filter((l): l is AdapterListing => Boolean(l));
    return {
      ok: listings.length > 0,
      provider: result.provider,
      target,
      recordsReturned: result.records.length,
      listingsNormalized: listings.length,
      withPrice: listings.filter((l) => l.price != null).length,
      withLocation: listings.filter((l) => Boolean(l.location)).length,
      withImages: listings.filter((l) => l.images.length > 0).length,
      withPostedTime: listings.filter((l) => Boolean(l.sourcePostedAt)).length,
      sample: listings.slice(0, 3),
    };
  } catch (err) {
    const e = err instanceof CollectionProviderError ? err : null;
    return {
      ok: false,
      provider: provider?.key ?? null,
      target,
      recordsReturned: 0, listingsNormalized: 0, withPrice: 0, withLocation: 0,
      withImages: 0, withPostedTime: 0, sample: [],
      error: err instanceof Error ? err.message : String(err),
      errorCategory: e?.category ?? "provider_error",
    };
  }
}
