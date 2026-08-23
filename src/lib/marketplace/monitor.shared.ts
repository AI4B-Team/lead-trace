/**
 * Marketplace Deals — monitoring vocabulary shared by server and UI.
 *
 * Truthfulness rules encoded here:
 *  - A search is only "Active" when a real source adapter exists AND a check
 *    has actually succeeded recently. We never render "monitoring" over a
 *    source that has been failing.
 *  - Freshness always distinguishes the marketplace's own posting time
 *    (`sourcePostedAt`) from when LeadTrace first saw the listing.
 */
import { MARKETPLACE_SOURCES, type MarketplaceCriteria } from "./catalog.shared";

/** Monitoring frequencies the scheduler understands. */
export const POLL_TIERS: { seconds: number; label: string; note: string }[] = [
  { seconds: 3600, label: "Every Hour", note: "Lightest load on the source." },
  { seconds: 600, label: "Every 10 Minutes", note: "Standard monitoring pace." },
  { seconds: 300, label: "Every 5 Minutes", note: "Faster discovery." },
  { seconds: 120, label: "Every 2 Minutes", note: "Aggressive discovery." },
  { seconds: 60, label: "About Every Minute", note: "Fastest tier the scheduler supports." },
];

export const DEFAULT_CHECK_INTERVAL_SECONDS = 600;

export function intervalLabel(seconds: number): string {
  const tier = POLL_TIERS.find((t) => t.seconds === seconds);
  if (tier) return tier.label;
  if (seconds < 60) return `Every ${seconds} Sec`;
  if (seconds < 3600) return `Every ${Math.round(seconds / 60)} Minutes`;
  return `Every ${Math.round(seconds / 3600)} Hours`;
}

/** Nearest supported tier — the scheduler never invents a frequency. */
export function normalizeInterval(seconds: number | null | undefined): number {
  if (!seconds || !Number.isFinite(seconds)) return DEFAULT_CHECK_INTERVAL_SECONDS;
  return POLL_TIERS.reduce(
    (best, t) => (Math.abs(t.seconds - seconds) < Math.abs(best - seconds) ? t.seconds : best),
    DEFAULT_CHECK_INTERVAL_SECONDS,
  );
}

/** Failures at or above this count stop pretending the search is monitoring. */
export const FAILURE_ATTENTION_THRESHOLD = 3;

export type MonitorHealthKey =
  | "paused"
  | "setup_incomplete"
  | "source_unavailable"
  | "needs_attention"
  | "delayed"
  | "baseline_pending"
  | "active";

export type MonitorHealth = {
  key: MonitorHealthKey;
  label: string;
  tone: "success" | "warn" | "danger" | "muted";
  detail: string | null;
};

export type MonitorFields = {
  status: string;
  sources: string[];
  criteria: MarketplaceCriteria;
  attentionNote?: string | null;
  checkIntervalSeconds?: number | null;
  baselineState?: string | null;
  lastCheckedAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  consecutiveFailures?: number | null;
  rateLimitedUntil?: string | null;
};

function liveSources(keys: string[]): string[] {
  return keys.filter((k) => MARKETPLACE_SOURCES.some((m) => m.key === k && m.status === "live"));
}

/** Single source of truth for what we tell the user about a search. */
export function monitorHealth(s: MonitorFields, now = Date.now()): MonitorHealth {
  if (s.status === "paused") {
    return { key: "paused", label: "Paused", tone: "muted", detail: "You paused this search." };
  }
  const hasCriteria =
    (s.criteria?.targets?.length ?? 0) > 0 ||
    (s.criteria?.keywords?.length ?? 0) > 0 ||
    Object.keys(s.criteria?.attributes ?? {}).length > 0;
  if (!s.sources.length || !hasCriteria) {
    return {
      key: "setup_incomplete",
      label: "Setup Incomplete",
      tone: "warn",
      detail: !s.sources.length ? "No marketplaces selected." : "No criteria to match on.",
    };
  }
  if (!liveSources(s.sources).length) {
    return {
      key: "source_unavailable",
      label: "Source Unavailable",
      tone: "muted",
      detail: "No marketplace connection is live yet, so nothing is being collected.",
    };
  }
  if (s.attentionNote) {
    return { key: "needs_attention", label: "Needs Attention", tone: "danger", detail: s.attentionNote };
  }
  if ((s.consecutiveFailures ?? 0) >= FAILURE_ATTENTION_THRESHOLD) {
    return {
      key: "needs_attention",
      label: "Needs Attention",
      tone: "danger",
      detail: s.lastError
        ? `${s.consecutiveFailures} Checks Failed: ${s.lastError}`
        : `${s.consecutiveFailures} Checks In A Row Failed.`,
    };
  }
  const rateLimited = s.rateLimitedUntil ? new Date(s.rateLimitedUntil).getTime() : 0;
  if (rateLimited > now) {
    return {
      key: "delayed",
      label: "Delayed",
      tone: "warn",
      detail: "The source rate limited us, so checks are backed off for a few minutes.",
    };
  }
  const interval = normalizeInterval(s.checkIntervalSeconds) * 1000;
  const lastSuccess = s.lastSuccessAt ? new Date(s.lastSuccessAt).getTime() : 0;
  if (lastSuccess && now - lastSuccess > interval * 3) {
    return {
      key: "delayed",
      label: "Delayed",
      tone: "warn",
      detail: "The last successful check is older than this search's schedule.",
    };
  }
  if ((s.consecutiveFailures ?? 0) > 0) {
    return {
      key: "delayed",
      label: "Delayed",
      tone: "warn",
      detail: s.lastError ? `Last Check Failed: ${s.lastError}` : "The last check failed. Retrying.",
    };
  }
  if (!lastSuccess || (s.baselineState ?? "pending") !== "established") {
    return {
      key: "baseline_pending",
      label: "Baseline Pending",
      tone: "warn",
      detail: "First check records what is already listed. Alerts start with genuinely new listings.",
    };
  }
  return { key: "active", label: "Active", tone: "success", detail: null };
}

/**
 * Alert copy for a new marketplace match. Market position is appended only when
 * comps were already computed and graded reliable — a time-sensitive alert never
 * waits for valuation.
 */
export type AlertListing = {
  matchScore: number;
  title: string;
  price: number | null;
  currency?: string | null;
  attributes?: Record<string, string | number>;
  distanceMiles?: number | null;
  locationText?: string | null;
  source: string;
  compConfidence?: string | null;
  marketPositionLabel?: string | null;
};

function money(price: number | null, currency?: string | null): string | null {
  if (price == null) return null;
  const symbol = !currency || currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${Math.round(price).toLocaleString("en-US")}`;
}

/** "101k Miles", "512GB", "18 Miles Away" — compact, only what the source gave. */
export function alertFacts(listing: AlertListing): string[] {
  const facts: string[] = [];
  const price = money(listing.price ?? null, listing.currency ?? null);
  if (price) facts.push(price);
  const attrs = listing.attributes ?? {};
  const mileage = Number(attrs["mileage"] ?? attrs["miles"] ?? NaN);
  if (Number.isFinite(mileage) && mileage > 0) {
    facts.push(mileage >= 1000 ? `${Math.round(mileage / 1000)}k Miles` : `${mileage} Miles`);
  }
  const hours = Number(attrs["hours"] ?? NaN);
  if (Number.isFinite(hours) && hours > 0) facts.push(`${hours.toLocaleString("en-US")} Hours`);
  const storage = attrs["storage"];
  if (storage) facts.push(String(storage));
  if (listing.distanceMiles != null && Number.isFinite(listing.distanceMiles)) {
    facts.push(`${Math.round(listing.distanceMiles)} Miles Away`);
  } else if (listing.locationText) {
    facts.push(listing.locationText);
  }
  return facts;
}

export function buildMatchAlert(listing: AlertListing): { title: string; body: string } {
  const facts = alertFacts(listing);
  const lines = [`${listing.matchScore}% Match`, listing.title, facts.join(" · ")].filter(Boolean);
  const sourceLabel =
    MARKETPLACE_SOURCES.find((s) => s.key === listing.source)?.label ?? listing.source;
  lines.push(sourceLabel);
  // Market position only when comps are already reliable — never invented, and
  // never a reason to hold the alert back.
  const reliable = listing.compConfidence === "high" || listing.compConfidence === "medium";
  if (reliable && listing.marketPositionLabel) lines.push(listing.marketPositionLabel);
  return { title: "New Marketplace Match", body: lines.join(" · ") };
}
