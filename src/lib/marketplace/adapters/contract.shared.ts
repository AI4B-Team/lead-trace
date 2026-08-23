/**
 * Marketplace Deals — SOURCE ADAPTER CONTRACT (client-safe).
 *
 * This is the integration boundary. Everything Marketplace Deals core knows
 * about a source lives here: the normalized listing shape, the capability
 * declaration, and the health vocabulary. Core matching, scoring, comps,
 * monitoring and UI code must never branch on a specific marketplace — if a
 * behaviour differs per source it belongs in a capability flag, not an
 * `if (source === "facebook")`.
 *
 * COMPLIANCE RULE: an adapter may only use access a marketplace actually
 * offers — official API, licensed data partner, documented feed, or an
 * authorized export. Nothing in this contract exists to defeat a marketplace's
 * protections, and an adapter that would need to is not built at all: the
 * source stays `planned` and the UI says Unavailable.
 *
 * This file is shared (no server-only imports) so the UI can read capabilities
 * and health labels without pulling adapter internals into the browser bundle.
 */
import type { MarketplaceCategory, MarketplaceSourceKey } from "../catalog.shared";

/* ------------------------------------------------------------------ *
 * Capabilities
 * ------------------------------------------------------------------ */

/**
 * What a source can actually do. The UI reads these to avoid promising a
 * feature the source has no way of supporting (e.g. a radius filter on a feed
 * that only publishes city-level listings).
 */
export type SourceCapability =
  | "search"
  | "keyword_query"
  | "category_filters"
  | "price_filter"
  | "location_radius"
  | "geo_coordinates"
  | "posted_time"
  | "seller_metadata"
  | "images"
  | "description"
  | "pagination"
  | "comp_search";

export const CAPABILITY_LABELS: Record<SourceCapability, string> = {
  search: "Search",
  keyword_query: "Keyword Query",
  category_filters: "Category Filters",
  price_filter: "Price Filter",
  location_radius: "Location Radius",
  geo_coordinates: "Map Coordinates",
  posted_time: "Posted Time",
  seller_metadata: "Seller Details",
  images: "Photos",
  description: "Full Description",
  pagination: "Pagination",
  comp_search: "Comparable Listings",
};

/**
 * Capability profile plus the operating limits core needs in order to schedule
 * the source honestly.
 */
export type SourceProfile = {
  source: MarketplaceSourceKey;
  capabilities: SourceCapability[];
  /** Categories the adapter can serve; empty means every category. */
  categories: MarketplaceCategory[];
  /**
   * Fastest check interval the source's access terms allow, in seconds. Core
   * clamps a user's chosen polling tier to this so an adapter can never be
   * driven past what its integration permits.
   */
  minCheckIntervalSeconds: number;
  /** Max listings core should request per check. */
  maxListingsPerCheck: number;
  /**
   * Plain-language description of HOW the data is obtained. Recorded so access
   * is auditable and never ambiguous.
   */
  accessModel: string;
  /** True when the source needs credentials the workspace/platform must supply. */
  requiresCredentials: boolean;
};

export function hasCapability(profile: SourceProfile | null, cap: SourceCapability): boolean {
  return Boolean(profile?.capabilities.includes(cap));
}

/** Capability labels for one source — used by the setup UI, never hard-coded. */
export function capabilityLabels(profile: SourceProfile | null): string[] {
  return (profile?.capabilities ?? []).map((c) => CAPABILITY_LABELS[c]);
}

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

export type SourceHealthKey =
  | "healthy"
  | "delayed"
  | "unavailable"
  | "auth_required"
  | "config_required";

export type SourceHealth = {
  key: SourceHealthKey;
  /** User-facing label. Title Case, no jargon. */
  label: string;
  /** User-facing explanation. Never a stack trace, URL or status code. */
  detail: string;
  /** Operator-only diagnostic; shown in platform admin, never to a customer. */
  diagnostic?: string | null;
};

const HEALTH_LABELS: Record<SourceHealthKey, { label: string; detail: string }> = {
  healthy: { label: "Healthy", detail: "This marketplace is responding normally." },
  delayed: { label: "Delayed", detail: "This marketplace is responding slowly, so checks may lag." },
  unavailable: { label: "Unavailable", detail: "This marketplace can't be reached right now." },
  auth_required: {
    label: "Authentication Required",
    detail: "This marketplace connection needs to be reconnected.",
  },
  config_required: {
    label: "Configuration Required",
    detail: "This marketplace isn't set up yet, so nothing is being collected.",
  },
};

/**
 * Build a health result with safe user-facing copy. Technical detail goes in
 * `diagnostic`, which the customer UI does not render.
 */
export function sourceHealth(
  key: SourceHealthKey,
  diagnostic?: string | null,
  detailOverride?: string,
): SourceHealth {
  const base = HEALTH_LABELS[key];
  return {
    key,
    label: base.label,
    detail: detailOverride ?? base.detail,
    diagnostic: diagnostic ?? null,
  };
}

export const HEALTH_TONE: Record<SourceHealthKey, "success" | "warn" | "danger" | "muted"> = {
  healthy: "success",
  delayed: "warn",
  unavailable: "danger",
  auth_required: "danger",
  config_required: "muted",
};

/* ------------------------------------------------------------------ *
 * Normalized listing
 * ------------------------------------------------------------------ */

/**
 * The ONLY listing shape Marketplace Deals core consumes. Source-specific
 * fields stay inside `categoryAttributes` (matchable) or `rawSourceMetadata`
 * (kept for provenance) — they never become top-level columns.
 */
export type AdapterListing = {
  source: MarketplaceSourceKey;
  /** Source's own stable identifier. Null only when the source has none. */
  sourceListingId: string | null;
  sourceUrl: string;

  category: MarketplaceCategory | null;
  title: string;
  description: string | null;

  price: number | null;
  currency: string;

  location: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMiles: number | null;

  /** Only when the marketplace publishes it publicly. Never inferred. */
  sellerName: string | null;
  sellerMetadata: Record<string, string | number | boolean>;

  images: string[];

  /** Category-specific, matchable attributes the source itself published. */
  categoryAttributes: Record<string, string | number>;

  /** Marketplace's own posting time. Null when the source doesn't publish one. */
  sourcePostedAt: string | null;
  /**
   * False when the timestamp is derived/approximate (e.g. "2 days ago"), so
   * freshness copy can avoid stating a precise posting moment.
   */
  sourcePostedAtReliable: boolean;
  /** When LeadTrace first observed it. Set by core, not by the source. */
  firstSeenAt: string | null;
  lastSeenAt: string | null;

  /** Untouched source payload subset, for provenance and debugging. */
  rawSourceMetadata: Record<string, unknown>;
};

export type ListingIdentity = {
  source: string;
  sourceListingId: string | null;
  /**
   * Stable key for deduplication: the source id when present, otherwise the
   * canonical URL. Never the title or the position in search results.
   */
  key: string;
};

/** Strip tracking noise so the same listing doesn't look new every check. */
export function canonicalListingUrl(url: string): string {
  try {
    const u = new URL(url);
    const drop = [...u.searchParams.keys()].filter(
      (k) => /^(utm_|fb|ref|_ga|mkt|campaign)/i.test(k) || k === "ref" || k === "referrer",
    );
    drop.forEach((k) => u.searchParams.delete(k));
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return url.trim();
  }
}

/**
 * Identity for deduplication. Source ids win because a bumped or relisted item
 * keeps its id while moving to the top of results.
 */
export function listingIdentity(listing: {
  source: string;
  sourceListingId?: string | null;
  sourceUrl: string;
}): ListingIdentity {
  const id = listing.sourceListingId?.trim() || null;
  return {
    source: listing.source,
    sourceListingId: id,
    key: id ? `${listing.source}:${id}` : `${listing.source}:url:${canonicalListingUrl(listing.sourceUrl)}`,
  };
}

/* ------------------------------------------------------------------ *
 * Normalization helpers (shared by every adapter)
 * ------------------------------------------------------------------ */

const MAX_RAW_METADATA_KEYS = 40;
const MAX_IMAGES = 12;

export function parsePrice(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || /^-/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseCoordinate(input: unknown, max: number): number | null {
  const n = typeof input === "number" ? input : Number.parseFloat(String(input ?? ""));
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

/** ISO timestamp or null. Rejects impossible/future-dated postings. */
export function parseTimestamp(input: unknown): string | null {
  if (!input) return null;
  const d = new Date(typeof input === "number" ? input : String(input));
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  // A posting time more than a day in the future is bad data, not a scoop.
  if (ms > Date.now() + 86_400_000) return null;
  return d.toISOString();
}

/** Keep only http(s) image URLs, deduplicated and bounded. */
export function sanitizeImages(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const raw of list) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!/^https?:\/\//i.test(url) || out.includes(url)) continue;
    out.push(url);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

/** Bound the raw payload so one chatty source can't bloat every row. */
export function boundRawMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_RAW_METADATA_KEYS) break;
    if (v === null || v === undefined) continue;
    if (typeof v === "string") out[k] = v.slice(0, 2000);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = JSON.stringify(v).slice(0, 2000);
  }
  return out;
}

/** Only string/number attribute values are matchable; everything else is dropped. */
export function cleanAttributes(input: unknown): Record<string, string | number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function cleanSellerMetadata(input: unknown): Record<string, string | number | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
    else if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
  }
  return out;
}

/**
 * Build a complete `AdapterListing` from partial adapter output, applying every
 * shared normalization rule in one place so adapters stay small and can't skip
 * a step.
 */
export function buildAdapterListing(
  source: MarketplaceSourceKey,
  input: {
    sourceListingId?: string | null;
    sourceUrl: string;
    category?: MarketplaceCategory | null;
    title?: unknown;
    description?: unknown;
    price?: unknown;
    currency?: unknown;
    location?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    distanceMiles?: unknown;
    sellerName?: unknown;
    sellerMetadata?: unknown;
    images?: unknown;
    categoryAttributes?: unknown;
    sourcePostedAt?: unknown;
    sourcePostedAtReliable?: boolean;
    rawSourceMetadata?: unknown;
  },
): AdapterListing {
  const postedAt = parseTimestamp(input.sourcePostedAt);
  const distance =
    input.distanceMiles == null ? null : parseCoordinate(input.distanceMiles, 100_000);
  return {
    source,
    sourceListingId: input.sourceListingId?.toString().trim() || null,
    sourceUrl: canonicalListingUrl(String(input.sourceUrl ?? "").trim()),
    category: input.category ?? null,
    title: String(input.title ?? "").trim().slice(0, 300),
    description:
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim().slice(0, 8000)
        : null,
    price: parsePrice(input.price),
    currency: (typeof input.currency === "string" && input.currency.trim()
      ? input.currency.trim()
      : "USD"
    )
      .toUpperCase()
      .slice(0, 3),
    location:
      typeof input.location === "string" && input.location.trim()
        ? input.location.trim().slice(0, 200)
        : null,
    latitude: parseCoordinate(input.latitude, 90),
    longitude: parseCoordinate(input.longitude, 180),
    distanceMiles: distance,
    sellerName:
      typeof input.sellerName === "string" && input.sellerName.trim()
        ? input.sellerName.trim().slice(0, 200)
        : null,
    sellerMetadata: cleanSellerMetadata(input.sellerMetadata),
    images: sanitizeImages(input.images),
    categoryAttributes: cleanAttributes(input.categoryAttributes),
    sourcePostedAt: postedAt,
    // A timestamp we didn't get can never be "reliable".
    sourcePostedAtReliable: postedAt ? input.sourcePostedAtReliable !== false : false,
    firstSeenAt: null,
    lastSeenAt: null,
    rawSourceMetadata: boundRawMetadata(input.rawSourceMetadata),
  };
}

/* ------------------------------------------------------------------ *
 * Search validation
 * ------------------------------------------------------------------ */

export type SearchValidation = {
  ok: boolean;
  /** Blocking reasons — the adapter cannot run this search at all. */
  errors: string[];
  /**
   * Non-blocking: the search runs, but part of it will be ignored because the
   * source lacks the capability. Surfaced in setup so nothing is over-promised.
   */
  unsupported: string[];
};

/**
 * Capability-driven validation every adapter can reuse: it checks the search
 * against the declared profile before any request is made.
 */
export function validateAgainstProfile(
  profile: SourceProfile,
  search: {
    category: string;
    criteria: { targets: string[]; keywords: string[]; priceMin?: number | null; priceMax?: number | null; attributes: Record<string, string | number> };
    location: string | null;
    radiusMiles: number | null;
  },
): SearchValidation {
  const errors: string[] = [];
  const unsupported: string[] = [];

  if (!profile.capabilities.includes("search")) {
    errors.push("This marketplace can't be searched directly.");
  }
  if (
    profile.categories.length &&
    !profile.categories.includes(search.category as MarketplaceCategory)
  ) {
    errors.push("This marketplace doesn't carry that category.");
  }
  const hasCriteria =
    search.criteria.targets.length > 0 ||
    search.criteria.keywords.length > 0 ||
    Object.keys(search.criteria.attributes ?? {}).length > 0;
  if (!hasCriteria) errors.push("Add at least one thing to look for.");

  if (search.radiusMiles != null && !profile.capabilities.includes("location_radius")) {
    unsupported.push("Distance radius isn't supported here, so nearby results aren't limited by miles.");
  }
  if (search.location && !profile.capabilities.includes("location_radius") && !profile.capabilities.includes("geo_coordinates")) {
    unsupported.push("Location filtering is limited on this marketplace.");
  }
  if (
    (search.criteria.priceMin != null || search.criteria.priceMax != null) &&
    !profile.capabilities.includes("price_filter")
  ) {
    unsupported.push("Price filtering is applied by LeadTrace after collection, not by the marketplace.");
  }
  return { ok: errors.length === 0, errors, unsupported };
}
