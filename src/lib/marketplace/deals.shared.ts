/**
 * Marketplace Deals feed — shared shapes and display helpers.
 *
 * Truthfulness rules encoded here:
 *  - The score is a MATCH SCORE against the user's saved criteria. Never a
 *    profitability/deal/resale score.
 *  - "Posted" and "First Seen" are different facts. We only say "Posted" when
 *    the source gave us a posting time we trust (`postedAtReliable`).
 *  - Cross-source duplicates are only grouped when the collector recorded a
 *    high confidence; low confidence stays as separate cards.
 */

import type {
  ExtractionConfidence, MarketPosition, MatchCriterion, SellerSignal,
} from "./match.shared";

/** Legacy compact breakdown, still written for older rendering paths. */
export type MatchCheck = {
  label: string;
  /** true = criterion met, false = potential mismatch / unspecified by seller. */
  ok: boolean;
  note?: string | null;
};

export type MarketplaceListingRow = {
  id: string;
  searchId: string | null;
  source: string;
  externalId: string | null;
  listingUrl: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  category: string | null;
  locationText: string | null;
  distanceMiles: number | null;
  attributes: Record<string, string | number>;
  photos: string[];
  seller: Record<string, string | number | boolean>;
  matchScore: number;
  matchBreakdown: MatchCheck[];
  /** Full four-state explanation produced by the matching layer. */
  matchCriteria: MatchCriterion[];
  attributeConfidence: Record<string, ExtractionConfidence>;
  sellerSignals: SellerSignal[];
  /** Independent of the Match Score. Never derived from it. */
  marketPosition: MarketPosition;
  marketPositionNote: string | null;
  disqualifiedReason: string | null;
  aiAnalysisUsed: boolean;
  analyzedAt: string | null;
  postedAt: string | null;
  postedAtReliable: boolean;
  firstSeenAt: string;
  duplicateGroup: string | null;
  duplicateConfidence: number | null;
  dismissedAt: string | null;
  savedAt: string | null;
  /** Comparable Listings cache pointers — null until comps are checked once. */
  compCount: number | null;
  compConfidence: string | null;
  compsCheckedAt: string | null;
};

/** A feed entry: one primary listing plus confidently-matched duplicates. */
export type DealGroup = {
  listing: MarketplaceListingRow;
  alsoListedOn: { source: string; listingUrl: string }[];
};

/** Only merge when the collector was confident the item is the same. */
export const DUPLICATE_CONFIDENCE_FLOOR = 0.85;

export function groupDeals(rows: MarketplaceListingRow[]): DealGroup[] {
  const groups: DealGroup[] = [];
  const byKey = new Map<string, DealGroup>();
  for (const row of rows) {
    const confident =
      row.duplicateGroup && (row.duplicateConfidence ?? 0) >= DUPLICATE_CONFIDENCE_FLOOR;
    if (!confident) {
      groups.push({ listing: row, alsoListedOn: [] });
      continue;
    }
    const existing = byKey.get(row.duplicateGroup!);
    if (!existing) {
      const group: DealGroup = { listing: row, alsoListedOn: [] };
      byKey.set(row.duplicateGroup!, group);
      groups.push(group);
      continue;
    }
    existing.alsoListedOn.push({ source: row.source, listingUrl: row.listingUrl });
  }
  return groups;
}

/** "Posted 4 Min Ago" vs "First Seen 4 Min Ago" — never interchangeable. */
export function freshnessLabel(row: MarketplaceListingRow): string {
  if (row.postedAt && row.postedAtReliable) return `Posted ${agoLabel(row.postedAt)}`;
  return `First Seen ${agoLabel(row.firstSeenAt)}`;
}

export function agoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "Unknown";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins} Min Ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} Hr Ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} Day${days === 1 ? "" : "s"} Ago`;
  return new Date(iso).toLocaleDateString("en-US");
}

export const MATCH_SCORE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Any Match Score" },
  { value: 70, label: "70% Match & Up" },
  { value: 80, label: "80% Match & Up" },
  { value: 90, label: "90% Match & Up" },
];

export const FRESHNESS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Any Time" },
  { value: 1, label: "Last Hour" },
  { value: 24, label: "Last 24 Hours" },
  { value: 72, label: "Last 3 Days" },
  { value: 168, label: "Last 7 Days" },
];

export function matchScoreTone(score: number): string {
  if (score >= 90) return "bg-success/10 text-success border-success/20";
  if (score >= 75) return "bg-accent/10 text-accent border-accent/20";
  return "bg-surface-muted text-muted-foreground border-border";
}

export function formatPrice(price: number | null, currency: string): string {
  if (price == null) return "Price Not Listed";
  const symbol = currency === "USD" || currency === "CAD" ? "$" : currency === "GBP" ? "£" : "";
  const value = Math.round(price).toLocaleString("en-US");
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

/** "101k Miles · Tampa, FL · 18 Miles Away" */
export function metaLine(row: MarketplaceListingRow): string {
  const parts: string[] = [];
  const mileage = row.attributes.mileage ?? row.attributes.miles;
  if (mileage != null && mileage !== "") {
    const n = Number(mileage);
    parts.push(
      Number.isFinite(n) && n >= 1000
        ? `${Math.round(n / 1000)}k Miles`
        : `${String(mileage)} Miles`,
    );
  }
  if (row.locationText) parts.push(row.locationText);
  if (row.distanceMiles != null) {
    parts.push(`${Math.round(row.distanceMiles).toLocaleString("en-US")} Miles Away`);
  }
  return parts.join(" · ");
}

/**
 * Comparable Listings are computed from actual listing evidence by the comps
 * engine (see comps.shared.ts). There is intentionally no "open a web search"
 * shortcut any more: a market range must be backed by comps we can show.
 */
