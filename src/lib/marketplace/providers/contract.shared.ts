/**
 * Marketplace Deals — COLLECTION PROVIDER CONTRACT (client-safe).
 *
 * A "collection provider" is the *infrastructure* that performs a retrieval on
 * our behalf: a managed collection service today, a first-party collector
 * later. It is deliberately separate from a SOURCE ADAPTER:
 *
 *   Source adapter  = "what Facebook Marketplace looks like"  (request shape,
 *                      field names, capabilities, normalization)
 *   Collection provider = "who actually performs the retrieval" (job submit,
 *                      poll, retrieve records, quota, credentials, health)
 *
 * Core Marketplace Deals code must never learn which provider ran a job, and a
 * source adapter must never learn either — it asks for a retrieval and gets
 * records back. Swapping or adding a provider therefore touches no adapter and
 * no core file.
 *
 * COMPLIANCE RULE (inherited from the adapter contract): a provider may only be
 * used for access a marketplace actually offers, through the provider's own
 * documented, terms-compliant product. Nothing here exists to defeat a
 * marketplace's protections, and no provider option is added for that purpose.
 *
 * This file is shared (no server-only imports) so operator UI can read provider
 * status vocabulary without pulling provider internals into the browser bundle.
 */

/* ------------------------------------------------------------------ *
 * Provider identity
 * ------------------------------------------------------------------ */

/**
 * Known provider keys. `first_party` is reserved for a future LeadTrace-operated
 * collector so core code paths already exist when it lands.
 */
export type CollectionProviderKey = "apify" | "brightdata" | "first_party" | "fixture";

export const PROVIDER_LABELS: Record<CollectionProviderKey, string> = {
  apify: "Managed Collection (Apify)",
  brightdata: "Managed Collection (Bright Data)",
  first_party: "First-Party Collector",
  fixture: "Recorded Fixtures",
};

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

/**
 * A retrieval request in provider-neutral terms. The source adapter fills this
 * in; the provider decides how to satisfy it.
 *
 * `target` carries the source's own addressable location (for most marketplaces
 * a public search URL the adapter built). `parameters` carries provider-visible
 * knobs the adapter wants honoured. Neither is interpreted by core.
 */
export type CollectionRequest = {
  /** Marketplace source key the request belongs to — used for job labelling. */
  source: string;
  /** The search this retrieval serves, for run history correlation. */
  searchId: string;
  /** One or more source-native targets to retrieve (usually search URLs). */
  targets: string[];
  /** Hard cap on records to retrieve. Providers must not exceed it. */
  maxRecords: number;
  /** Ask the provider for per-record detail when it supports it (costs more). */
  wantDetail?: boolean;
  /** Adapter-supplied extras. Provider-specific, never read by core. */
  parameters?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * Why a retrieval failed, in terms every provider can map onto. The scheduler
 * branches on the CATEGORY, never on a provider's status codes or messages.
 */
export type ProviderErrorCategory =
  | "not_configured"
  | "auth"
  | "quota"
  | "rate_limited"
  | "blocked"
  | "timeout"
  | "bad_request"
  | "provider_error"
  | "empty";

/** Categories worth trying again later without operator involvement. */
const RETRYABLE: ProviderErrorCategory[] = ["rate_limited", "timeout", "provider_error"];

/** Categories that mean "stop asking until a human changes something". */
const TERMINAL: ProviderErrorCategory[] = ["not_configured", "auth", "quota", "bad_request"];

export function isRetryableCategory(c: ProviderErrorCategory): boolean {
  return RETRYABLE.includes(c);
}

export function isTerminalCategory(c: ProviderErrorCategory): boolean {
  return TERMINAL.includes(c);
}

export class CollectionProviderError extends Error {
  constructor(
    public category: ProviderErrorCategory,
    message: string,
    public retryAfterSeconds: number | null = null,
    public provider: CollectionProviderKey | null = null,
  ) {
    super(message);
    this.name = "CollectionProviderError";
  }

  get retryable(): boolean {
    return isRetryableCategory(this.category);
  }
}

/** Customer-safe copy per category. Provider names and status codes stay out. */
export function providerErrorMessage(category: ProviderErrorCategory): string {
  switch (category) {
    case "not_configured":
      return "This marketplace isn't set up for collection yet, so nothing is being retrieved.";
    case "auth":
      return "The collection connection needs to be reconnected.";
    case "quota":
      return "The collection allowance for this account is used up.";
    case "rate_limited":
      return "Collection is being slowed down right now, so checks may lag.";
    case "blocked":
      return "This marketplace didn't return results for this check.";
    case "timeout":
      return "This check took too long and was stopped.";
    case "bad_request":
      return "This search can't be collected as configured.";
    case "empty":
      return "This check completed with no listings returned.";
    default:
      return "Collection couldn't be completed right now.";
  }
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

/** What one retrieval cost and produced. Recorded per run for metrics. */
export type CollectionUsage = {
  /** Requests we made to the provider (submit + polls + retrieval). */
  requests: number;
  /** Raw records the provider handed back, before any filtering. */
  records: number;
  /** Wall-clock duration of the retrieval, in milliseconds. */
  durationMs: number;
};

export type CollectionResult = {
  provider: CollectionProviderKey;
  /** Provider-side job reference for operator traceability. */
  jobId: string | null;
  /** Raw, un-normalized records. The SOURCE ADAPTER normalizes these. */
  records: unknown[];
  usage: CollectionUsage;
  /** True when the provider asked us to slow down. */
  rateLimited: boolean;
  retryAfterSeconds: number | null;
  /** True when more records existed than the cap allowed. */
  truncated: boolean;
  note: string | null;
};

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

export type ProviderHealthKey = "healthy" | "degraded" | "unavailable" | "not_configured";

export type ProviderHealth = {
  provider: CollectionProviderKey;
  key: ProviderHealthKey;
  /** Operator-facing label. Title Case. */
  label: string;
  /** Operator-facing explanation. No secrets, ever. */
  detail: string;
};

const PROVIDER_HEALTH_LABELS: Record<ProviderHealthKey, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unavailable: "Unavailable",
  not_configured: "Not Configured",
};

export function providerHealth(
  provider: CollectionProviderKey,
  key: ProviderHealthKey,
  detail: string,
): ProviderHealth {
  return { provider, key, label: PROVIDER_HEALTH_LABELS[key], detail };
}

/* ------------------------------------------------------------------ *
 * The provider contract
 * ------------------------------------------------------------------ */

/**
 * Every provider implements the same four verbs. `collect` is what adapters
 * call; the submit/poll/retrieve trio exists because managed providers are
 * asynchronous, and exposing them keeps long jobs resumable and cancellable
 * instead of hidden inside one un-observable await.
 */
export type CollectionProvider = {
  key: CollectionProviderKey;
  /** Plain-language description of HOW collection happens. Auditable. */
  accessModel: string;
  /** Sources this provider is configured to serve. */
  supportedSources: string[];
  /** False when credentials/config are missing — checked before any network call. */
  isConfigured: () => boolean;

  /** Start a retrieval. Returns a job handle. */
  executeSearch: (request: CollectionRequest) => Promise<ProviderJob>;
  /** Current state of a job. No side effects. */
  checkStatus: (job: ProviderJob) => Promise<ProviderJob>;
  /** Fetch the raw records of a finished job. */
  retrieveResults: (job: ProviderJob) => Promise<CollectionResult>;
  /** Submit → poll → retrieve, with the provider's own timing rules. */
  collect: (request: CollectionRequest) => Promise<CollectionResult>;
  /** Best-effort stop, so a timed-out job doesn't keep spending. */
  cancel?: (job: ProviderJob) => Promise<void>;

  healthCheck: () => Promise<ProviderHealth>;
  /** Operator-only detail: quotas, account, pinned versions. Never secrets. */
  getMetadata?: () => Record<string, string | number | boolean>;
};

export type ProviderJobState = "queued" | "running" | "succeeded" | "failed" | "timed_out";

export type ProviderJob = {
  provider: CollectionProviderKey;
  id: string;
  state: ProviderJobState;
  /** Provider-native handle for the result set, when it has one. */
  resultRef?: string | null;
  startedAt: number;
  /** Requests spent on this job so far, carried into usage metrics. */
  requests: number;
  error?: { category: ProviderErrorCategory; message: string } | null;
};

/* ------------------------------------------------------------------ *
 * Variable polling
 * ------------------------------------------------------------------ */

/**
 * VARIABLE POLLING (2–10 minutes).
 *
 * A search that keeps producing new listings is checked at the fast end; a
 * search that has been quiet backs off toward the slow end. This is bounded on
 * both sides so cost stays predictable and no source is ever hit faster than
 * its adapter's declared minimum (the caller clamps with the source profile).
 */
export const FAST_INTERVAL_SECONDS = 120;
export const SLOW_INTERVAL_SECONDS = 600;

export function nextCheckInterval(input: {
  /** The user's chosen pace — treated as the FLOOR of the adaptive window. */
  baseSeconds: number;
  /** New listings found on the check that just finished. */
  newListings: number;
  /** Consecutive checks that produced nothing new, INCLUDING this one. */
  quietChecks: number;
  /** Provider or source asked us to slow down. */
  rateLimited?: boolean;
  retryAfterSeconds?: number | null;
}): number {
  const floor = Math.max(FAST_INTERVAL_SECONDS, Math.min(input.baseSeconds, SLOW_INTERVAL_SECONDS));

  if (input.rateLimited) {
    // Honour the provider's own instruction; never poll faster than asked.
    return Math.max(input.retryAfterSeconds ?? SLOW_INTERVAL_SECONDS, SLOW_INTERVAL_SECONDS);
  }
  // Producing right now: go to the fast end of the user's window.
  if (input.newListings > 0) return floor;

  // Quiet: step toward the slow end, one step per quiet check, capped.
  const step = Math.min(Math.max(input.quietChecks, 0), 4);
  const span = SLOW_INTERVAL_SECONDS - floor;
  return Math.round(floor + (span * step) / 4);
}

/** Bounded exponential backoff with jitter, used for job polling. */
export function pollDelayMs(attempt: number, baseMs = 2000, maxMs = 15000): number {
  const raw = Math.min(baseMs * 2 ** Math.max(attempt, 0), maxMs);
  // Jitter inside the cap, so the delay never exceeds `maxMs`.
  return Math.min(maxMs, Math.round(raw * (0.75 + Math.random() * 0.5)));
}
