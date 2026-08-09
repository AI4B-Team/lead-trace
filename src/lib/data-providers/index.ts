// ---------------------------------------------------------------------------
// Data provider abstraction. Real providers plug in behind the same shape so
// the pipeline orchestrator stays clean. Every provider gracefully falls back
// with an explicit error when its credentials aren't configured.
// ---------------------------------------------------------------------------

export type RawLead = {
  full_name?: string | null;
  business_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  source_meta?: Record<string, unknown>;
};

export type BusinessScrapeParams = {
  niches: string[];
  counties: string[];
  state: string;
  /** Per-search cap. Defaults to 500 in the adapter when unset. */
  max_results?: number | null;
  /** Optional progress sink so long runs can stream status to the user. */
  onProgress?: (message: string, count?: number) => Promise<void> | void;
};

export interface BusinessScraper {
  key: string;
  isConfigured(): boolean;
  scrape(params: BusinessScrapeParams): Promise<RawLead[]>;
}

/**
 * `unknown` is a first-class, FAIL-CLOSED outcome: the provider returned a
 * result set that did not cover this phone. It is never treated as clean.
 */
export type ScrubStatus = "clean" | "dnc" | "litigator" | "unknown";

/**
 * Thrown when no DNC/litigator provider is configured, or the configured
 * provider could not be reached. Callers must FAIL the run — never fabricate
 * a clean result. Texting an unscrubbed list is the most expensive mistake
 * this product can make.
 */
export class DncUnavailableError extends Error {
  readonly code = "dnc_unavailable";
  constructor(message: string) {
    super(message);
    this.name = "DncUnavailableError";
  }
}

export type ScrubResult = {
  provider: string;
  results: Array<{ phone: string; status: ScrubStatus }>;
  proof: Record<string, unknown>;
};

export interface DncScrubber {
  key: string;
  isConfigured(): boolean;
  scrub(phones: string[]): Promise<ScrubResult>;
}

export { getBusinessScraper, apifySourceForTemplate, type ApifySourceId } from "./apify";
export { getDncScrubber } from "./dnc";