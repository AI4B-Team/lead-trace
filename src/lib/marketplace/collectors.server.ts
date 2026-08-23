/**
 * Marketplace source collection — thin bridge over the adapter registry.
 *
 * The real integration boundary is `adapters/registry.server.ts` +
 * `adapters/contract.shared.ts`. This module stays only so the monitoring
 * engine keeps a small, stable surface: give it a source key and a search, get
 * pipeline-ready listings back.
 *
 * HARD RULE (unchanged): only sources with a real, authorized adapter AND a
 * `live` catalog entry can be collected from. A search pointed at anything else
 * reports "Source Unavailable" and collects nothing, rather than inventing
 * listings.
 */
import type { SourceListing } from "./analyze.server";
import type { MarketplaceCriteria } from "./catalog.shared";
import { EMPTY_CRITERIA } from "./catalog.shared";
import {
  adapterBackedSources, collectFromAdapter, getAdapter, hasAnyAdapter,
  type AdapterSearch,
} from "./adapters/registry.server";

export type CollectorSearch = {
  id: string;
  category: string;
  criteria: MarketplaceCriteria;
  location: string | null;
  radiusMiles: number | null;
};

export type CollectResult = {
  listings: SourceListing[];
  /** True when the source told us to slow down (429 / explicit throttle). */
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  /** Source-side note worth surfacing in the run log. */
  note?: string | null;
};

export type MarketplaceCollector = {
  key: string;
  /** Fetch the CURRENT listing set for this search. Monitoring only needs what
   *  is currently visible, so deep pagination is never required. */
  collect: (search: CollectorSearch) => Promise<CollectResult>;
};

/** Raised when a search names a source that has no adapter behind it. */
export class NoCollectorError extends Error {
  constructor(public source: string) {
    super(`No live integration exists for ${source} yet.`);
    this.name = "NoCollectorError";
  }
}

/** Raised by adapters when the source throttled the request. */
export class SourceRateLimitedError extends Error {
  constructor(source: string, public retryAfterSeconds = 600) {
    super(`${source} rate limited this check.`);
    this.name = "SourceRateLimitedError";
  }
}

function toAdapterSearch(search: CollectorSearch): AdapterSearch {
  const criteria = { ...EMPTY_CRITERIA, ...(search.criteria ?? {}) };
  return {
    id: search.id,
    category: search.category,
    criteria: {
      targets: criteria.targets ?? [],
      keywords: criteria.keywords ?? [],
      exclusions: criteria.exclusions ?? [],
      priceMin: criteria.priceMin ?? null,
      priceMax: criteria.priceMax ?? null,
      attributes: criteria.attributes ?? {},
    },
    location: search.location,
    radiusMiles: search.radiusMiles,
  };
}

/** A collector view of whichever adapter is registered for this source. */
export function getCollector(source: string): MarketplaceCollector | null {
  const adapter = getAdapter(source);
  if (!adapter) return null;
  return {
    key: adapter.source,
    collect: async (search) => {
      const result = await collectFromAdapter(adapter.source, toAdapterSearch(search));
      return {
        listings: result.listings,
        rateLimited: result.rateLimited,
        ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
        note: result.note,
      };
    },
  };
}

/** Sources that both claim `live` in the catalog and have an adapter registered. */
export function collectableSources(sources: string[]): string[] {
  return adapterBackedSources(sources);
}

export function hasAnyCollector(): boolean {
  return hasAnyAdapter();
}
