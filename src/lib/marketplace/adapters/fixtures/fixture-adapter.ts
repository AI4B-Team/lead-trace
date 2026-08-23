/**
 * TEST-ONLY adapters built from fixtures.
 *
 * These are never registered in the shipping registry (`registerAdapter` would
 * reject them anyway, because no catalog source is `live`). They exist so the
 * adapter contract itself can be exercised offline: normalization, identity,
 * deduplication, timestamp handling, capability gating and health states.
 */
import {
  buildAdapterListing, parseTimestamp, sourceHealth,
  type AdapterListing, type SourceCapability, type SourceHealth, type SourceProfile,
} from "../contract.shared";
import type { AdapterSearch, AdapterSearchResult, MarketplaceSourceAdapter } from "../registry.server";
import { DIRTY_PAYLOADS, FEED_STYLE_PAYLOADS, RELATIVE_TIME_PAYLOADS } from "./sample-payloads";

const FULL_CAPABILITIES: SourceCapability[] = [
  "search", "keyword_query", "category_filters", "price_filter", "location_radius",
  "geo_coordinates", "posted_time", "seller_metadata", "images", "description", "pagination",
];

function profile(overrides: Partial<SourceProfile> = {}): SourceProfile {
  return {
    source: "craigslist",
    capabilities: FULL_CAPABILITIES,
    categories: [],
    minCheckIntervalSeconds: 300,
    maxListingsPerCheck: 50,
    accessModel: "Fixture data. Test use only; never a live marketplace request.",
    requiresCredentials: false,
    ...overrides,
  };
}

/** Feed-style raw record -> normalized listing. */
export function normalizeFeedPayload(raw: any, source: SourceProfile["source"]): AdapterListing | null {
  if (!raw?.permalink) return null;
  return buildAdapterListing(source, {
    sourceListingId: raw.listing_id ?? null,
    sourceUrl: raw.permalink,
    title: raw.name,
    description: raw.body,
    price: raw.amount,
    currency: raw.currency_code,
    location: raw.place,
    latitude: raw.lat,
    longitude: raw.lon,
    distanceMiles: raw.distance_mi ?? null,
    sellerName: raw.seller?.display_name,
    sellerMetadata: raw.seller ?? {},
    images: raw.photos,
    categoryAttributes: raw.specs ?? {},
    sourcePostedAt: raw.posted_time,
    sourcePostedAtReliable: true,
    rawSourceMetadata: raw.internal ?? {},
  });
}

/** "2 days ago" style record: derived timestamp, so never marked reliable. */
export function normalizeRelativePayload(raw: any, source: SourceProfile["source"]): AdapterListing | null {
  if (!raw?.url) return null;
  const ageMs = parseRelativeAge(raw.age_text);
  const derived = ageMs == null ? null : new Date(Date.now() - ageMs).toISOString();
  return buildAdapterListing(source, {
    // No stable id: identity must fall back to the canonical URL.
    sourceListingId: null,
    sourceUrl: raw.url,
    title: raw.heading,
    price: raw.price_text,
    location: raw.city,
    images: raw.thumbnails,
    categoryAttributes: raw.facts ?? {},
    sourcePostedAt: parseTimestamp(derived),
    sourcePostedAtReliable: false,
    rawSourceMetadata: { age_text: raw.age_text ?? null },
  });
}

function parseRelativeAge(text: unknown): number | null {
  const m = /^(\d+)\s*(minute|hour|day|week)s?\s+ago$/i.exec(String(text ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const ms = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[unit]!;
  return n * ms;
}

export type FixtureAdapterOptions = {
  payloads?: readonly unknown[];
  style?: "feed" | "relative";
  profileOverrides?: Partial<SourceProfile>;
  health?: SourceHealth;
  throwOnSearch?: Error;
  rateLimited?: boolean;
};

/** Build a working adapter over fixture payloads. */
export function createFixtureAdapter(opts: FixtureAdapterOptions = {}): MarketplaceSourceAdapter {
  const p = profile(opts.profileOverrides);
  const style = opts.style ?? "feed";
  const payloads =
    opts.payloads ?? (style === "relative" ? RELATIVE_TIME_PAYLOADS : FEED_STYLE_PAYLOADS);
  const normalize = (raw: unknown) =>
    style === "relative" ? normalizeRelativePayload(raw, p.source) : normalizeFeedPayload(raw, p.source);

  return {
    source: p.source,
    profile: p,
    normalizeListing: normalize,
    searchListings: async (_search: AdapterSearch): Promise<AdapterSearchResult> => {
      if (opts.throwOnSearch) throw opts.throwOnSearch;
      const listings = payloads.map(normalize).filter((l): l is AdapterListing => Boolean(l));
      return {
        listings,
        ...(opts.rateLimited ? { rateLimited: true, retryAfterSeconds: 900 } : {}),
      };
    },
    healthCheck: async () => opts.health ?? sourceHealth("healthy"),
    getSourceMetadata: () => ({ fixture: true, payloadCount: payloads.length }),
  };
}

/** Adapter over the deliberately messy payloads. */
export function createDirtyFixtureAdapter(): MarketplaceSourceAdapter {
  return createFixtureAdapter({ payloads: DIRTY_PAYLOADS, style: "feed" });
}
