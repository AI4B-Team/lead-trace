/**
 * Marketplace source adapter registry.
 *
 * HARD RULE: this registry only ever contains sources with a real, working
 * integration. There are no sample, demo or simulated collectors — a search
 * pointed at a source with no adapter reports "Source Unavailable" and collects
 * nothing, rather than inventing listings.
 *
 * To add a source: implement `MarketplaceCollector`, register it below, and flip
 * that source to `status: "live"` in catalog.shared.ts. Both must happen
 * together, or the UI and the scheduler will disagree.
 */
import type { SourceListing } from "./analyze.server";
import { MARKETPLACE_SOURCES } from "./catalog.shared";
import type { MarketplaceCriteria } from "./catalog.shared";

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
  /** Source-side note worth surfacing in the run log. */
  note?: string | null;
};

export type MarketplaceCollector = {
  key: string;
  /** Fetch the CURRENT listing set for this search. No pagination beyond page 1
   *  is required: monitoring only needs what is currently visible. */
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

// Deliberately empty: no marketplace has a functioning adapter yet.
const COLLECTORS: Record<string, MarketplaceCollector> = {};

export function getCollector(source: string): MarketplaceCollector | null {
  return COLLECTORS[source] ?? null;
}

/** Sources that both claim `live` in the catalog and have an adapter registered. */
export function collectableSources(sources: string[]): string[] {
  return sources.filter(
    (key) =>
      Boolean(COLLECTORS[key]) &&
      MARKETPLACE_SOURCES.some((s) => s.key === key && s.status === "live"),
  );
}

export function hasAnyCollector(): boolean {
  return Object.keys(COLLECTORS).length > 0;
}
