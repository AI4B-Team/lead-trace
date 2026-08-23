/**
 * Marketplace Deals — matching model and deterministic Match Score.
 *
 * Rules encoded here, deliberately and permanently:
 *  - The score answers ONE question: how well does this listing match the
 *    user's saved search criteria? It is never a profit, resale or deal score.
 *  - Market position (above / at / below market) is a SEPARATE, independent
 *    fact. It never feeds the Match Score.
 *  - Missing information is `unknown`, never `not_matched`. Unknowns cost a
 *    small amount of certainty, they do not fail a listing.
 *  - Nothing in here invents listing facts. A criterion is only `matched` or
 *    `not_matched` when the extracted attributes actually say so.
 *
 * This module is pure so the same scoring runs on the server (analysis) and in
 * tests, and its output renders directly in the UI.
 */
import {
  CATEGORY_ATTRIBUTES, attributeLabel, formatAttrValue, formatMoney,
  type MarketplaceCategory, type MarketplaceCriteria,
} from "./catalog.shared";

/* ------------------------------------------------------------------ types */

/** Four states — "unknown" and "not_matched" are never collapsed together. */
export type CriterionState = "matched" | "not_matched" | "unknown" | "conflicting";

export type ExtractionConfidence = "high" | "medium" | "low";

export type MatchCriterion = {
  /** Stable key, e.g. "price_max", "attr.title_status", "radius". */
  key: string;
  /** Human label already in Title Case, e.g. "Under Maximum Price". */
  label: string;
  state: CriterionState;
  /** Why — only ever built from real extracted values. */
  detail?: string | null;
  /** Confidence in the extracted value the state was derived from. */
  confidence?: ExtractionConfidence | null;
  /** Relative importance. Hard user constraints weigh more than nice-to-haves. */
  weight: number;
  /** True when this criterion came from the user's search (not informational). */
  fromCriteria: boolean;
};

/** Neutral, observable seller-language signals. Never a psychological label. */
export type SellerSignal = {
  key: string;
  label: string;
  /** Quote or paraphrase from the listing that supports the signal. */
  evidence?: string | null;
};

/** Independent of Match Score. `unknown` is the honest default. */
export type MarketPosition = "above" | "at" | "below" | "unknown";

export const MARKET_POSITION_LABEL: Record<MarketPosition, string> = {
  above: "Above Market",
  at: "At Market",
  below: "Below Market",
  unknown: "Unknown Market Position",
};

/** Extracted attribute plus how sure we are of it. */
export type ExtractedAttribute = {
  value: string | number;
  confidence: ExtractionConfidence;
};

export type ExtractedAttributes = Record<string, ExtractedAttribute>;

export type MatchResult = {
  score: number;
  criteria: MatchCriterion[];
  /** Set when deterministic filters rejected the listing before AI analysis. */
  disqualifiedReason: string | null;
};

/* --------------------------------------------------------------- listing in */

/** The normalized listing shape the matcher works on. */
export type NormalizedListing = {
  title: string;
  description: string | null;
  price: number | null;
  category: MarketplaceCategory | null;
  locationText: string | null;
  distanceMiles: number | null;
  attributes: ExtractedAttributes;
  sellerSignals?: SellerSignal[];
};

export type MatchSearchSpec = {
  category: MarketplaceCategory;
  criteria: MarketplaceCriteria;
  radiusMiles: number | null;
};

/* -------------------------------------------------------------- prefiltering */

/** Attribute keys that express an upper/lower bound rather than an equality. */
const MAX_SUFFIX = "_max";
const MIN_SUFFIX = "_min";

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function haystack(l: NormalizedListing): string {
  return `${l.title} ${l.description ?? ""}`.toLowerCase();
}

/** Tokens of a target phrase, ignoring filler. */
function tokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/**
 * Cheap deterministic gate, run BEFORE any AI call. Only rejects on facts the
 * listing states outright, with slack so borderline listings still get scored.
 */
export function prefilter(
  listing: NormalizedListing,
  spec: MatchSearchSpec,
): { disqualified: boolean; reason: string | null } {
  const text = haystack(listing);

  for (const ex of spec.criteria.exclusions) {
    const term = ex.trim().toLowerCase();
    if (term && text.includes(term)) {
      return { disqualified: true, reason: `Listing Mentions Excluded Term "${ex.trim()}"` };
    }
  }

  const { priceMax, priceMin } = spec.criteria;
  if (priceMax != null && listing.price != null && listing.price > priceMax * 1.25) {
    return {
      disqualified: true,
      reason: `Asking ${formatMoney(Math.round(listing.price))} Is Far Above Maximum ${formatMoney(priceMax)}`,
    };
  }
  if (priceMin != null && listing.price != null && listing.price < priceMin * 0.5) {
    return {
      disqualified: true,
      reason: `Asking ${formatMoney(Math.round(listing.price))} Is Far Below Minimum ${formatMoney(priceMin)}`,
    };
  }

  if (spec.radiusMiles != null && listing.distanceMiles != null) {
    if (listing.distanceMiles > spec.radiusMiles * 1.2) {
      return {
        disqualified: true,
        reason: `${Math.round(listing.distanceMiles)} Miles Away Is Outside The ${spec.radiusMiles} Mile Radius`,
      };
    }
  }

  // Every target completely absent from the listing text = wrong item.
  if (spec.criteria.targets.length) {
    const anyHit = spec.criteria.targets.some((t) => {
      const ts = tokens(t);
      if (!ts.length) return true;
      return ts.some((tok) => text.includes(tok));
    });
    if (!anyHit) {
      return {
        disqualified: true,
        reason: `Listing Does Not Mention ${spec.criteria.targets.slice(0, 3).join(" Or ")}`,
      };
    }
  }

  return { disqualified: false, reason: null };
}

/**
 * Which criteria still need AI help after deterministic extraction. Empty means
 * the listing can be scored without spending a model call.
 */
export function unresolvedCriteriaKeys(spec: MatchSearchSpec, attrs: ExtractedAttributes): string[] {
  const missing: string[] = [];
  for (const key of Object.keys(spec.criteria.attributes)) {
    const base = baseAttrKey(key);
    if (attrs[base] === undefined) missing.push(base);
  }
  return missing.filter((k, i, arr) => arr.indexOf(k) === i);
}

/** "mileage_max" → "mileage", "year_min" → "year". */
export function baseAttrKey(key: string): string {
  if (key.endsWith(MAX_SUFFIX)) return key.slice(0, -MAX_SUFFIX.length);
  if (key.endsWith(MIN_SUFFIX)) return key.slice(0, -MIN_SUFFIX.length);
  return key;
}

/* -------------------------------------------------------------------- score */

const WEIGHT: Record<string, number> = {
  target: 3,
  price: 3,
  radius: 2,
  bound: 2,
  equality: 1.5,
  keyword: 1,
};

function push(list: MatchCriterion[], c: MatchCriterion) {
  list.push(c);
}

function stateForEquality(
  expected: string,
  actual: ExtractedAttribute | undefined,
): { state: CriterionState; detail: string | null; confidence: ExtractionConfidence | null } {
  if (!actual) return { state: "unknown", detail: "Not Specified By Seller", confidence: null };
  const a = String(actual.value).trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  if (!a) return { state: "unknown", detail: "Not Specified By Seller", confidence: actual.confidence };
  const hit = a === e || a.includes(e) || e.includes(a);
  return {
    state: hit ? "matched" : "not_matched",
    detail: `Listing Says ${formatAttrValue(String(actual.value))}`,
    confidence: actual.confidence,
  };
}

/**
 * Evaluate every criterion, then reduce to a 0–100 Match Score.
 *
 * Score = weighted share of decidable criteria that matched, minus a small
 * certainty penalty for unknowns. Unknowns can never sink a listing on their
 * own, and a single real mismatch always costs more than any unknown.
 */
export function evaluateMatch(listing: NormalizedListing, spec: MatchSearchSpec): MatchResult {
  const pre = prefilter(listing, spec);
  const criteria: MatchCriterion[] = [];
  const text = haystack(listing);
  const attrs = listing.attributes ?? {};

  /* targets ------------------------------------------------------------- */
  for (const target of spec.criteria.targets) {
    const ts = tokens(target);
    const hits = ts.filter((t) => text.includes(t)).length;
    const state: CriterionState =
      ts.length === 0 ? "unknown" : hits === ts.length ? "matched" : hits > 0 ? "not_matched" : "not_matched";
    push(criteria, {
      key: `target.${target}`,
      label: titleize(target),
      state,
      detail: state === "matched" ? null : "Listing Text Does Not Confirm This",
      weight: WEIGHT.target,
      fromCriteria: true,
    });
  }

  /* price --------------------------------------------------------------- */
  const { priceMax, priceMin } = spec.criteria;
  if (priceMax != null) {
    push(criteria, {
      key: "price_max",
      label: `Under Maximum Price (${formatMoney(priceMax)})`,
      state: listing.price == null ? "unknown" : listing.price <= priceMax ? "matched" : "not_matched",
      detail:
        listing.price == null
          ? "Price Not Listed"
          : `Asking ${formatMoney(Math.round(listing.price))}`,
      weight: WEIGHT.price,
      fromCriteria: true,
    });
  }
  if (priceMin != null) {
    push(criteria, {
      key: "price_min",
      label: `Over Minimum Price (${formatMoney(priceMin)})`,
      state: listing.price == null ? "unknown" : listing.price >= priceMin ? "matched" : "not_matched",
      detail:
        listing.price == null
          ? "Price Not Listed"
          : `Asking ${formatMoney(Math.round(listing.price))}`,
      weight: WEIGHT.price,
      fromCriteria: true,
    });
  }

  /* attributes ---------------------------------------------------------- */
  for (const [key, expected] of Object.entries(spec.criteria.attributes)) {
    if (expected === "" || expected == null) continue;
    const base = baseAttrKey(key);
    const actual = attrs[base];
    const label = attributeLabel(spec.category, base);

    if (key.endsWith(MAX_SUFFIX) || key.endsWith(MIN_SUFFIX)) {
      const bound = toNumber(expected);
      const value = actual ? toNumber(actual.value) : null;
      const isMax = key.endsWith(MAX_SUFFIX);
      let state: CriterionState = "unknown";
      if (bound != null && value != null) {
        state = isMax ? (value <= bound ? "matched" : "not_matched") : value >= bound ? "matched" : "not_matched";
      }
      push(criteria, {
        key: `attr.${key}`,
        label: boundLabel(label, base, bound, isMax),
        state,
        detail:
          value == null
            ? "Not Specified By Seller"
            : `Listing Says ${formatAttrValue(String(actual!.value))}`,
        confidence: actual?.confidence ?? null,
        weight: WEIGHT.bound,
        fromCriteria: true,
      });
      continue;
    }

    const e = stateForEquality(String(expected), actual);
    push(criteria, {
      key: `attr.${key}`,
      label: equalityLabel(label, String(expected)),
      state: e.state,
      detail: e.detail,
      confidence: e.confidence,
      weight: WEIGHT.equality,
      fromCriteria: true,
    });
  }

  /* radius -------------------------------------------------------------- */
  if (spec.radiusMiles != null) {
    push(criteria, {
      key: "radius",
      label: `Within Search Radius (${spec.radiusMiles} Miles)`,
      state:
        listing.distanceMiles == null
          ? "unknown"
          : listing.distanceMiles <= spec.radiusMiles
            ? "matched"
            : "not_matched",
      detail:
        listing.distanceMiles == null
          ? "Distance Not Available From Source"
          : `${Math.round(listing.distanceMiles)} Miles Away`,
      weight: WEIGHT.radius,
      fromCriteria: true,
    });
  }

  /* keywords ------------------------------------------------------------ */
  for (const kw of spec.criteria.keywords) {
    const term = kw.trim().toLowerCase();
    if (!term) continue;
    push(criteria, {
      key: `keyword.${term}`,
      label: `Mentions ${titleize(kw)}`,
      state: text.includes(term) ? "matched" : "unknown",
      detail: text.includes(term) ? null : "Not Mentioned In Listing",
      weight: WEIGHT.keyword,
      fromCriteria: true,
    });
  }

  /* exclusions ---------------------------------------------------------- */
  for (const ex of spec.criteria.exclusions) {
    const term = ex.trim().toLowerCase();
    if (!term) continue;
    const hit = text.includes(term);
    push(criteria, {
      key: `exclusion.${term}`,
      label: `No ${titleize(ex)}`,
      state: hit ? "not_matched" : "matched",
      detail: hit ? `Listing Mentions ${titleize(ex)}` : null,
      weight: WEIGHT.equality,
      fromCriteria: true,
    });
  }

  /* informational unknowns for category attributes the seller skipped --- */
  for (const slot of CATEGORY_ATTRIBUTES[spec.category] ?? []) {
    const base = baseAttrKey(slot.key);
    if (spec.criteria.attributes[slot.key] !== undefined) continue;
    if (attrs[base] !== undefined) continue;
    push(criteria, {
      key: `info.${base}`,
      label: `${attributeLabel(spec.category, base)} Not Provided`,
      state: "unknown",
      detail: "Seller Did Not Specify",
      weight: 0.5,
      fromCriteria: false,
    });
  }

  return { score: scoreOf(criteria), criteria, disqualifiedReason: pre.reason };
}

/** Deterministic reduction of criterion states to 0–100. */
export function scoreOf(criteria: MatchCriterion[]): number {
  let matched = 0;
  let decidable = 0;
  let unknownWeight = 0;
  let lowConfidence = 0;

  for (const c of criteria) {
    if (c.state === "matched") {
      matched += c.weight;
      decidable += c.weight;
      if (c.confidence === "low") lowConfidence += c.weight;
    } else if (c.state === "not_matched" || c.state === "conflicting") {
      decidable += c.weight;
    } else {
      unknownWeight += c.weight;
    }
  }

  if (decidable === 0) return 0;

  const base = (matched / decidable) * 100;
  // Certainty penalties: capped so an unknown never outweighs a real mismatch.
  const unknownPenalty = Math.min(12, unknownWeight * 3);
  const confidencePenalty = Math.min(6, lowConfidence * 2);
  return Math.max(0, Math.min(100, Math.round(base - unknownPenalty - confidencePenalty)));
}

/* ------------------------------------------------------------------ labels */

function titleize(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function boundLabel(label: string, base: string, bound: number | null, isMax: boolean): string {
  const pretty = label.replace(/\s*(From|Max|Maximum|Minimum)$/i, "").trim();
  const unit = base === "mileage" ? " Miles" : base === "hours" ? " Hours" : "";
  if (bound == null) return pretty;
  if (base === "year") return isMax ? `${pretty} ${bound} Or Older` : `${pretty} ${bound} Or Newer`;
  const n = bound.toLocaleString("en-US");
  return isMax ? `Under ${n}${unit || ` ${pretty}`}`.trim() : `Over ${n}${unit || ` ${pretty}`}`.trim();
}

function equalityLabel(label: string, expected: string): string {
  const value = titleize(expected);
  if (/title/i.test(label)) return `${value} Title`;
  if (/seller/i.test(label)) return `${value} Seller`;
  if (/make|model|brand/i.test(label)) return `Correct ${label}`;
  return `${label}: ${value}`;
}

/** Grouped view for the card and detail drawer. */
export function groupCriteria(criteria: MatchCriterion[]): {
  matched: MatchCriterion[];
  mismatched: MatchCriterion[];
  unknown: MatchCriterion[];
} {
  return {
    matched: criteria.filter((c) => c.state === "matched"),
    mismatched: criteria.filter((c) => c.state === "not_matched" || c.state === "conflicting"),
    unknown: criteria.filter((c) => c.state === "unknown"),
  };
}

export const CRITERION_STATE_LABEL: Record<CriterionState, string> = {
  matched: "Matched",
  not_matched: "Potential Mismatch",
  unknown: "Unknown",
  conflicting: "Conflicting Information",
};

export const CONFIDENCE_LABEL: Record<ExtractionConfidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/* --------------------------------------------------------------- threshold */

export const MATCH_THRESHOLD_PRESETS = [70, 80, 90] as const;

/** Default alerting bar. Consistent with LeadTrace's other quality gates. */
export const DEFAULT_MIN_MATCH_SCORE = 80;

export function meetsThreshold(score: number, minMatchScore: number): boolean {
  return score >= Math.max(0, Math.min(100, minMatchScore));
}
