/**
 * Marketplace Deals — source adapter registry (server).
 *
 * The registry is the only place core code learns which marketplaces are real.
 * Rules that keep the boundary clean:
 *
 *  1. Registration requires BOTH an adapter implementation AND a `live` entry in
 *     catalog.shared.ts. A mismatch throws at startup instead of shipping a UI
 *     that promises a source nothing collects from.
 *  2. Core never imports an adapter module directly — it asks the registry.
 *  3. Adapters return `AdapterListing`; the bridge below converts to the
 *     pipeline's `SourceListing`, so adding a source touches no core file.
 *  4. Only authorized access models are acceptable: official API, licensed data
 *     partner, documented public feed, or an authorized export. An adapter that
 *     would need to defeat a marketplace's protections is not written.
 */
import type { SourceListing } from "../analyze.server";
import { MARKETPLACE_SOURCES, type MarketplaceSourceKey } from "../catalog.shared";
import {
  buildAdapterListing, listingIdentity, sourceHealth, validateAgainstProfile,
  type AdapterListing, type ListingIdentity, type SearchValidation, type SourceHealth,
  type SourceProfile,
} from "./contract.shared";

/** The search spec handed to an adapter. Adapter-shaped, not database-shaped. */
export type AdapterSearch = {
  id: string;
  category: string;
  criteria: {
    targets: string[];
    keywords: string[];
    exclusions: string[];
    priceMin?: number | null;
    priceMax?: number | null;
    attributes: Record<string, string | number>;
  };
  location: string | null;
  radiusMiles: number | null;
  /** Highest `sourcePostedAt`/`lastSeenAt` core already has, when useful. */
  since?: string | null;
};

export type AdapterSearchResult = {
  listings: AdapterListing[];
  /** True when the source asked us to slow down. */
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  /** True when more pages exist but were intentionally not fetched. */
  truncated?: boolean;
  note?: string | null;
  /**
   * How the retrieval was performed. Set by adapters that use a collection
   * provider; recorded in run history for cost and reliability metrics. Core
   * treats it as opaque and never branches on the provider.
   */
  collection?: CollectionRunMetrics;
};

/** Provider-neutral retrieval metrics for one adapter run. */
export type CollectionRunMetrics = {
  provider: string;
  jobId: string | null;
  /** Requests spent at the provider. */
  requests: number;
  /** Raw records the provider returned, before normalization or filtering. */
  records: number;
  durationMs: number;
};

/**
 * The adapter contract. Only `profile`, `searchListings` and `healthCheck` are
 * required; the rest have shared defaults so a small adapter stays small.
 */
export type MarketplaceSourceAdapter = {
  source: MarketplaceSourceKey;
  profile: SourceProfile;

  /** Capability + credential check, before any network call. */
  validateSearch?: (search: AdapterSearch) => SearchValidation;

  /** Fetch the listings currently visible for this search. */
  searchListings: (search: AdapterSearch) => Promise<AdapterSearchResult>;

  /** Map one raw source record into the normalized shape. */
  normalizeListing?: (raw: unknown) => AdapterListing | null;

  /** Override only when the source's identity rule isn't id-then-URL. */
  getListingIdentity?: (listing: AdapterListing) => ListingIdentity;

  /** Override when posting time needs source-specific interpretation. */
  getSourcePostedTime?: (listing: AdapterListing) => { at: string | null; reliable: boolean };

  /** Override when the canonical public URL differs from the collected one. */
  getListingUrl?: (listing: AdapterListing) => string;

  /** Anything operators need: quotas, account, feed name. No secrets. */
  getSourceMetadata?: () => Record<string, string | number | boolean>;

  /** Is the integration usable right now? */
  healthCheck: () => Promise<SourceHealth>;
};

/**
 * Registered adapters. Intentionally EMPTY: no marketplace integration is
 * authorized and working yet, so Marketplace Deals reports Unavailable rather
 * than inventing listings. Register real adapters here as they land.
 */
const ADAPTERS: Partial<Record<MarketplaceSourceKey, MarketplaceSourceAdapter>> = {};

/** Registration guard — keeps the catalog and the registry from drifting apart. */
export function registerAdapter(adapter: MarketplaceSourceAdapter): void {
  const entry = MARKETPLACE_SOURCES.find((s) => s.key === adapter.source);
  if (!entry) throw new Error(`Unknown marketplace source: ${adapter.source}`);
  if (entry.status !== "live") {
    throw new Error(
      `${entry.label} has an adapter but is still marked planned in the source catalog. Flip both together.`,
    );
  }
  if (adapter.profile.source !== adapter.source) {
    throw new Error(`Adapter profile source mismatch for ${adapter.source}.`);
  }
  ADAPTERS[adapter.source] = adapter;
}

export function getAdapter(source: string): MarketplaceSourceAdapter | null {
  return ADAPTERS[source as MarketplaceSourceKey] ?? null;
}

export function registeredAdapters(): MarketplaceSourceAdapter[] {
  return Object.values(ADAPTERS).filter(Boolean) as MarketplaceSourceAdapter[];
}

export function getSourceProfile(source: string): SourceProfile | null {
  return getAdapter(source)?.profile ?? null;
}

/** Sources with a registered adapter AND a `live` catalog entry. */
export function adapterBackedSources(sources: string[]): string[] {
  return sources.filter((key) => Boolean(getAdapter(key)));
}

export function hasAnyAdapter(): boolean {
  return registeredAdapters().length > 0;
}

/** Slowest of the user's tier and every selected source's minimum interval. */
export function clampIntervalForSources(sources: string[], seconds: number): number {
  return adapterBackedSources(sources).reduce(
    (acc, key) => Math.max(acc, getSourceProfile(key)?.minCheckIntervalSeconds ?? 0),
    seconds,
  );
}

/* ------------------------------------------------------------------ *
 * Capability-aware helpers used by core
 * ------------------------------------------------------------------ */

export function validateSearchForSource(source: string, search: AdapterSearch): SearchValidation {
  const adapter = getAdapter(source);
  if (!adapter) {
    return {
      ok: false,
      errors: ["This marketplace isn't connected yet, so it can't be monitored."],
      unsupported: [],
    };
  }
  return adapter.validateSearch
    ? adapter.validateSearch(search)
    : validateAgainstProfile(adapter.profile, search);
}

export function identityFor(adapter: MarketplaceSourceAdapter, listing: AdapterListing): ListingIdentity {
  return adapter.getListingIdentity
    ? adapter.getListingIdentity(listing)
    : listingIdentity(listing);
}

export function postedTimeFor(
  adapter: MarketplaceSourceAdapter,
  listing: AdapterListing,
): { at: string | null; reliable: boolean } {
  if (adapter.getSourcePostedTime) return adapter.getSourcePostedTime(listing);
  // No `posted_time` capability means any timestamp we hold is our own sighting,
  // never the marketplace's posting moment.
  if (!adapter.profile.capabilities.includes("posted_time")) return { at: null, reliable: false };
  return { at: listing.sourcePostedAt, reliable: listing.sourcePostedAtReliable };
}

export function listingUrlFor(adapter: MarketplaceSourceAdapter, listing: AdapterListing): string {
  return adapter.getListingUrl ? adapter.getListingUrl(listing) : listing.sourceUrl;
}

/** Adapter-declared operating detail for platform admin. Never customer-facing. */
export function sourceMetadataFor(adapter: MarketplaceSourceAdapter): Record<string, string | number | boolean> {
  return {
    accessModel: adapter.profile.accessModel,
    requiresCredentials: adapter.profile.requiresCredentials,
    minCheckIntervalSeconds: adapter.profile.minCheckIntervalSeconds,
    ...(adapter.getSourceMetadata?.() ?? {}),
  };
}

/**
 * Health for one source, with a registry-level answer when nothing is wired.
 * Adapter failures degrade to Unavailable and keep the technical text in
 * `diagnostic` so customers never see internals.
 */
export async function checkSourceHealth(source: string): Promise<SourceHealth> {
  const adapter = getAdapter(source);
  if (!adapter) return sourceHealth("config_required");
  try {
    return await adapter.healthCheck();
  } catch (err) {
    return sourceHealth("unavailable", err instanceof Error ? err.message : String(err));
  }
}

/* ------------------------------------------------------------------ *
 * Bridge: AdapterListing -> pipeline SourceListing
 * ------------------------------------------------------------------ */

/**
 * The single conversion point between the adapter world and the matching
 * pipeline. Source-specific fields land in `attributes`/`seller`, and the raw
 * payload rides along under a reserved key rather than becoming columns.
 */
export function toSourceListing(
  adapter: MarketplaceSourceAdapter,
  listing: AdapterListing,
): SourceListing {
  const posted = postedTimeFor(adapter, listing);
  const identity = identityFor(adapter, listing);
  const supportsSeller = adapter.profile.capabilities.includes("seller_metadata");
  const supportsCoords = adapter.profile.capabilities.includes("geo_coordinates");
  return {
    source: listing.source,
    externalId: identity.sourceListingId,
    listingUrl: listingUrlFor(adapter, listing),
    title: listing.title,
    description: adapter.profile.capabilities.includes("description") ? listing.description : null,
    price: listing.price,
    currency: listing.currency,
    category: listing.category,
    locationText: listing.location,
    distanceMiles: listing.distanceMiles,
    attributes: listing.categoryAttributes,
    photos: adapter.profile.capabilities.includes("images") ? listing.images : [],
    seller: supportsSeller
      ? { ...(listing.sellerName ? { name: listing.sellerName } : {}), ...listing.sellerMetadata }
      : {},
    sellerName: supportsSeller ? listing.sellerName : null,
    latitude: supportsCoords ? listing.latitude : null,
    longitude: supportsCoords ? listing.longitude : null,
    sourceMetadata: listing.rawSourceMetadata ?? {},
    postedAt: posted.at,
    postedAtReliable: posted.reliable,
  };
}


/**
 * Run one adapter for one search: validate, collect, normalize, bound, convert.
 * Core calls this and gets pipeline-ready listings without knowing the source.
 */
export async function collectFromAdapter(
  source: string,
  search: AdapterSearch,
): Promise<{
  listings: SourceListing[];
  normalized: AdapterListing[];
  rateLimited: boolean;
  retryAfterSeconds?: number;
  note: string | null;
  collection: CollectionRunMetrics | null;
}> {
  const adapter = getAdapter(source);
  if (!adapter) throw new Error(`No integration exists for ${source} yet.`);

  const validation = validateSearchForSource(source, search);
  if (!validation.ok) throw new Error(validation.errors[0] ?? "This search can't run on that marketplace.");

  const result = await adapter.searchListings(search);
  const seen = new Set<string>();
  const normalized: AdapterListing[] = [];
  for (const raw of result.listings ?? []) {
    // Re-run the shared normalizer so an adapter can't skip a rule.
    const listing = buildAdapterListing(adapter.source, {
      ...raw,
      sourceUrl: listingUrlFor(adapter, raw),
      sourcePostedAt: postedTimeFor(adapter, raw).at,
      sourcePostedAtReliable: postedTimeFor(adapter, raw).reliable,
    });
    if (!listing.title || !listing.sourceUrl) continue;
    const key = identityFor(adapter, listing).key;
    if (seen.has(key)) continue; // same item twice in one page of results
    seen.add(key);
    normalized.push(listing);
    if (normalized.length >= adapter.profile.maxListingsPerCheck) break;
  }

  return {
    listings: normalized.map((l) => toSourceListing(adapter, l)),
    normalized,
    rateLimited: Boolean(result.rateLimited),
    ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    note: result.note ?? (result.truncated ? "More results were available than were collected." : null),
    collection: result.collection ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Test hooks
 * ------------------------------------------------------------------ */

/**
 * Install an adapter without the catalog `live` guard. TESTS ONLY — it lets the
 * contract be exercised against fixtures while the shipping registry stays
 * empty. Never call this from application code.
 */
export function __setAdapterForTests(adapter: MarketplaceSourceAdapter): void {
  ADAPTERS[adapter.source] = adapter;
}

export function __resetAdaptersForTests(): void {
  for (const key of Object.keys(ADAPTERS)) delete ADAPTERS[key as MarketplaceSourceKey];
}
