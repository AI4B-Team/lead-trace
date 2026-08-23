/**
 * COMPARABLE LISTINGS — pure comp ranking, summary and confidence math.
 *
 * Truthfulness rules encoded here, deliberately and permanently:
 *  - A market range is only ever computed from ACTUAL comparable listings we
 *    hold. Nothing in this module can invent a value, an ARV, or a profit.
 *  - We report "Market Difference", never Profit / Expected Profit: LeadTrace
 *    does not know intent, repairs, fees, taxes or transport.
 *  - Asking prices and verified sold prices are separate populations and are
 *    never averaged together.
 *  - Confidence is derived from evidence (count, similarity, geography,
 *    recency, attribute completeness, source quality) — never from how sure a
 *    model "feels".
 *  - Too little evidence returns `insufficient`. The caller still shows the
 *    comps that were found.
 */
import { attributeLabel, formatMoney, type MarketplaceCategory } from "./catalog.shared";

/* ------------------------------------------------------------------- types */

export type CompPriceKind = "asking" | "sold";

/** Where market-value data comes from — separate concept from where we hunt. */
export type CompSourceKind = "observed_listing" | "sold_record" | "valuation_feed";

export type CompSimilarityNote = {
  key: string;
  label: string;
  state: "match" | "close" | "differs" | "unknown";
  detail: string | null;
};

/** A candidate comp before ranking: whatever a comp source could give us. */
export type CompCandidate = {
  id: string;
  /** Comp source key, e.g. "observed:facebook". */
  source: string;
  sourceLabel: string;
  sourceKind: CompSourceKind;
  listingUrl: string | null;
  title: string;
  price: number | null;
  priceKind: CompPriceKind;
  /** When the comp price was observed (sold date for sold comps). */
  observedAt: string | null;
  locationText: string | null;
  distanceMiles: number | null;
  attributes: Record<string, string | number>;
};

export type Comp = CompCandidate & {
  price: number;
  /** 0–100 attribute-and-geography similarity to the subject. */
  similarity: number;
  similarityNotes: CompSimilarityNote[];
  /** Usable comps back the range; unusable ones are still browsable. */
  usable: boolean;
  unusableReason: string | null;
};

export type CompSubject = {
  title: string;
  price: number | null;
  category: MarketplaceCategory;
  locationText: string | null;
  distanceMiles: number | null;
  attributes: Record<string, string | number>;
  /** Search radius, used for geographic relevance. */
  radiusMiles: number | null;
};

export type CompsConfidence = "high" | "medium" | "low";

export const COMPS_CONFIDENCE_LABEL: Record<CompsConfidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export type ConfidenceFactor = {
  label: string;
  detail: string;
  /** Honest read on that single input. */
  state: "strong" | "fair" | "weak";
};

export type CompsSummary = {
  status: "sufficient" | "insufficient";
  compsFound: number;
  usableCount: number;
  askingCount: number;
  soldCount: number;
  /** Which population the range came from. Never a blend. */
  basis: CompPriceKind | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  median: number | null;
  subjectPrice: number | null;
  /** Absolute distance from the subject asking price to the range edges. */
  differenceLow: number | null;
  differenceHigh: number | null;
  direction: "below" | "above" | "within" | null;
  confidence: CompsConfidence;
  confidenceFactors: ConfidenceFactor[];
};

/* --------------------------------------------------- category comp rulesets */

type CompareKind =
  /** Same value or it is not the same item. */
  | "identity"
  /** Same value expected, difference tolerated with a penalty. */
  | "exact"
  /** Numeric with an absolute tolerance (years). */
  | "year"
  /** Numeric with a proportional tolerance (mileage, hours, sqft). */
  | "ratio";

export type CompField = {
  key: string;
  label: string;
  weight: number;
  kind: CompareKind;
  /** Years: absolute tolerance. Ratio: fraction of the subject value. */
  tolerance?: number;
};

export type CompRuleset = {
  fields: CompField[];
  /** Weight given to geographic relevance for this category. */
  geoWeight: number;
  /** Minimum similarity for a comp to back the range. */
  usableFloor: number;
};

/**
 * Extensible by design: adding a category means adding a ruleset, never
 * touching the ranking engine.
 */
export const COMP_RULES: Record<MarketplaceCategory, CompRuleset> = {
  vehicles: {
    fields: [
      { key: "make", label: "Make", weight: 3, kind: "identity" },
      { key: "model", label: "Model", weight: 3, kind: "identity" },
      { key: "trim", label: "Trim", weight: 1, kind: "exact" },
      { key: "year", label: "Year", weight: 2.5, kind: "year", tolerance: 3 },
      { key: "mileage", label: "Mileage", weight: 2.5, kind: "ratio", tolerance: 0.3 },
      { key: "title_status", label: "Title", weight: 2, kind: "exact" },
      { key: "condition", label: "Condition", weight: 1, kind: "exact" },
      { key: "transmission", label: "Transmission", weight: 0.5, kind: "exact" },
    ],
    geoWeight: 2,
    usableFloor: 70,
  },
  electronics: {
    fields: [
      { key: "brand", label: "Brand", weight: 2.5, kind: "identity" },
      { key: "model", label: "Model", weight: 3, kind: "identity" },
      { key: "generation", label: "Generation", weight: 2, kind: "exact" },
      { key: "storage", label: "Storage", weight: 2, kind: "exact" },
      { key: "carrier", label: "Carrier", weight: 1, kind: "exact" },
      { key: "condition", label: "Condition", weight: 2, kind: "exact" },
    ],
    geoWeight: 0.5,
    usableFloor: 72,
  },
  furniture: {
    fields: [
      { key: "brand", label: "Brand", weight: 2.5, kind: "exact" },
      { key: "collection", label: "Collection", weight: 1.5, kind: "exact" },
      { key: "item_type", label: "Item Type", weight: 3, kind: "identity" },
      { key: "material", label: "Material", weight: 1, kind: "exact" },
      { key: "dimensions", label: "Dimensions", weight: 1, kind: "exact" },
      { key: "condition", label: "Condition", weight: 2, kind: "exact" },
    ],
    geoWeight: 1.5,
    usableFloor: 68,
  },
  tools: {
    fields: [
      { key: "brand", label: "Brand", weight: 2.5, kind: "identity" },
      { key: "model", label: "Model", weight: 2, kind: "exact" },
      { key: "tool_type", label: "Tool Type", weight: 2.5, kind: "identity" },
      { key: "power_source", label: "Power Source", weight: 1, kind: "exact" },
      { key: "condition", label: "Condition", weight: 1.5, kind: "exact" },
    ],
    geoWeight: 1,
    usableFloor: 68,
  },
  heavy_equipment: {
    fields: [
      { key: "make", label: "Manufacturer", weight: 3, kind: "identity" },
      { key: "model", label: "Model", weight: 3, kind: "identity" },
      { key: "equipment_type", label: "Equipment Type", weight: 1.5, kind: "exact" },
      { key: "year", label: "Year", weight: 2, kind: "year", tolerance: 4 },
      { key: "hours", label: "Hours", weight: 2.5, kind: "ratio", tolerance: 0.35 },
      { key: "condition", label: "Condition", weight: 1.5, kind: "exact" },
    ],
    geoWeight: 1.5,
    usableFloor: 70,
  },
  appliances: {
    fields: [
      { key: "brand", label: "Brand", weight: 2.5, kind: "identity" },
      { key: "model", label: "Model", weight: 2, kind: "exact" },
      { key: "appliance_type", label: "Appliance Type", weight: 2.5, kind: "identity" },
      { key: "fuel_type", label: "Fuel Type", weight: 1, kind: "exact" },
      { key: "condition", label: "Condition", weight: 1.5, kind: "exact" },
    ],
    geoWeight: 1.5,
    usableFloor: 68,
  },
  collectibles: {
    fields: [
      { key: "item_type", label: "Item Type", weight: 3, kind: "identity" },
      { key: "era", label: "Era", weight: 1.5, kind: "exact" },
      { key: "grade", label: "Grade", weight: 2.5, kind: "exact" },
      { key: "condition", label: "Condition", weight: 1.5, kind: "exact" },
    ],
    geoWeight: 0.25,
    usableFloor: 72,
  },
  fashion: {
    fields: [
      { key: "brand", label: "Brand", weight: 3, kind: "identity" },
      { key: "model", label: "Model", weight: 2, kind: "exact" },
      { key: "item_type", label: "Item Type", weight: 2, kind: "identity" },
      { key: "size", label: "Size", weight: 2, kind: "exact" },
      { key: "condition", label: "Condition", weight: 1.5, kind: "exact" },
    ],
    geoWeight: 0.25,
    usableFloor: 70,
  },
  real_estate: {
    fields: [
      { key: "property_type", label: "Property Type", weight: 3, kind: "identity" },
      { key: "beds", label: "Beds", weight: 2, kind: "year", tolerance: 1 },
      { key: "baths", label: "Baths", weight: 1.5, kind: "year", tolerance: 1 },
      { key: "sqft", label: "Sq Ft", weight: 2.5, kind: "ratio", tolerance: 0.25 },
      { key: "year_built", label: "Year Built", weight: 1, kind: "year", tolerance: 10 },
    ],
    geoWeight: 3,
    usableFloor: 72,
  },
  other: {
    fields: [
      { key: "item_type", label: "Item Type", weight: 3, kind: "identity" },
      { key: "brand", label: "Brand", weight: 2, kind: "exact" },
      { key: "model", label: "Model", weight: 2, kind: "exact" },
      { key: "condition", label: "Condition", weight: 1.5, kind: "exact" },
    ],
    geoWeight: 1,
    usableFloor: 70,
  },
};

export function compRules(category: MarketplaceCategory): CompRuleset {
  return COMP_RULES[category] ?? COMP_RULES.other;
}

/* ---------------------------------------------------------------- identity */

function norm(v: string | number | undefined | null): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v).toLowerCase().replace(/\s+/g, " ").trim() || null;
}

function num(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalized item identity, used as the comp-cache key. Only identity-kind
 * fields plus the category take part, so trivial title differences reuse cache.
 */
export function compIdentityKey(subject: CompSubject): string {
  const rules = compRules(subject.category);
  const parts = rules.fields
    .filter((f) => f.kind === "identity" || f.kind === "year")
    .map((f) => `${f.key}=${norm(subject.attributes[f.key]) ?? "?"}`);
  if (!parts.some((p) => !p.endsWith("=?"))) {
    // Nothing structured to key on — fall back to the normalized title.
    parts.push(`title=${norm(subject.title) ?? "?"}`);
  }
  return `${subject.category}|${parts.join("|")}`;
}

/** Cache scope key: identity plus everything that changes the comp population. */
export function compCacheKey(subject: CompSubject): string {
  const geo = norm(subject.locationText) ?? "anywhere";
  const radius = subject.radiusMiles == null ? "nationwide" : `${subject.radiusMiles}mi`;
  return `${compIdentityKey(subject)}|geo=${geo}|radius=${radius}`;
}

/* ----------------------------------------------------------------- ranking */

function fieldSimilarity(
  field: CompField,
  subjectValue: string | number | undefined,
  compValue: string | number | undefined,
  category: MarketplaceCategory,
): { sim: number | null; note: CompSimilarityNote } {
  const label = field.label || attributeLabel(category, field.key);
  const s = subjectValue;
  const c = compValue;
  if (s === undefined || s === null || s === "" || c === undefined || c === null || c === "") {
    return {
      sim: null,
      note: {
        key: field.key,
        label,
        state: "unknown",
        detail: c === undefined || c === null || c === "" ? "Not Listed On Comp" : "Not Known For Subject",
      },
    };
  }

  if (field.kind === "identity" || field.kind === "exact") {
    const same = norm(s) === norm(c);
    return {
      sim: same ? 1 : 0,
      note: {
        key: field.key,
        label,
        state: same ? "match" : "differs",
        detail: same ? String(c) : `Comp: ${String(c)}`,
      },
    };
  }

  const sn = num(s);
  const cn = num(c);
  if (sn == null || cn == null) {
    return {
      sim: null,
      note: { key: field.key, label, state: "unknown", detail: "Not Comparable" },
    };
  }
  const diff = Math.abs(sn - cn);
  const tolerance =
    field.kind === "year"
      ? (field.tolerance ?? 3)
      : Math.max(1, (field.tolerance ?? 0.3) * Math.max(sn, 1));
  const sim = Math.max(0, 1 - diff / (tolerance || 1));
  return {
    sim,
    note: {
      key: field.key,
      label,
      state: sim >= 0.95 ? "match" : sim >= 0.5 ? "close" : "differs",
      detail: `Comp: ${cn.toLocaleString("en-US")}`,
    },
  };
}

function geoSimilarity(subject: CompSubject, comp: CompCandidate): number | null {
  if (comp.distanceMiles == null) return null;
  const radius = subject.radiusMiles ?? 250;
  if (comp.distanceMiles <= radius) return 1;
  return Math.max(0, 1 - (comp.distanceMiles - radius) / (radius * 2));
}

/**
 * Rank candidates against the subject. Identity mismatches are excluded from
 * the range but kept in the list so the user can inspect what we found.
 */
export function rankComps(subject: CompSubject, candidates: CompCandidate[]): Comp[] {
  const rules = compRules(subject.category);
  const out: Comp[] = [];
  for (const cand of candidates) {
    if (cand.price == null || !Number.isFinite(cand.price) || cand.price <= 0) continue;

    const notes: CompSimilarityNote[] = [];
    let weighted = 0;
    let weight = 0;
    let identityConflict: string | null = null;
    let comparedFields = 0;

    for (const field of rules.fields) {
      const { sim, note } = fieldSimilarity(
        field,
        subject.attributes[field.key],
        cand.attributes[field.key],
        subject.category,
      );
      notes.push(note);
      if (sim == null) {
        // Unknowns cost certainty at half weight; they never disqualify.
        weight += field.weight * 0.5;
        continue;
      }
      comparedFields += 1;
      weight += field.weight;
      weighted += field.weight * sim;
      if (field.kind === "identity" && sim === 0) {
        identityConflict = `${note.label} Differs From The Subject`;
      }
    }

    const geo = geoSimilarity(subject, cand);
    if (geo == null) {
      weight += rules.geoWeight * 0.5;
      notes.push({
        key: "geo",
        label: "Distance",
        state: "unknown",
        detail: cand.locationText ?? "Not Provided",
      });
    } else {
      weight += rules.geoWeight;
      weighted += rules.geoWeight * geo;
      notes.push({
        key: "geo",
        label: "Distance",
        state: geo >= 1 ? "match" : geo >= 0.5 ? "close" : "differs",
        detail:
          cand.distanceMiles == null
            ? null
            : `${Math.round(cand.distanceMiles).toLocaleString("en-US")} Miles Away`,
      });
    }

    const similarity = weight > 0 ? Math.round((weighted / weight) * 100) : 0;
    const thin = comparedFields < 2;
    const usable = !identityConflict && !thin && similarity >= rules.usableFloor;
    out.push({
      ...cand,
      price: cand.price,
      similarity,
      similarityNotes: notes,
      usable,
      unusableReason: identityConflict
        ? identityConflict
        : thin
          ? "Too Few Shared Attributes To Compare"
          : similarity < rules.usableFloor
            ? `Similarity Below ${rules.usableFloor}%`
            : null,
    });
  }
  return out.sort((a, b) => b.similarity - a.similarity || a.price - b.price);
}

/* ------------------------------------------------------------- summarizing */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function roundMoney(n: number): number {
  return Math.round(n / 25) * 25;
}

/** Minimum usable comps before we are willing to state a range at all. */
export const MIN_USABLE_COMPS = 3;
/** Sold comps are preferred as the basis once there are enough of them. */
export const MIN_SOLD_FOR_BASIS = 3;

const RECENT_DAYS = 60;

export function summarizeComps(subject: CompSubject, comps: Comp[]): CompsSummary {
  const usable = comps.filter((c) => c.usable);
  const askingCount = comps.filter((c) => c.priceKind === "asking").length;
  const soldCount = comps.filter((c) => c.priceKind === "sold").length;
  const usableSold = usable.filter((c) => c.priceKind === "sold");
  const usableAsking = usable.filter((c) => c.priceKind === "asking");

  // Sold prices and asking prices are never mixed into one range.
  const basisSet =
    usableSold.length >= MIN_SOLD_FOR_BASIS
      ? usableSold
      : usableAsking.length >= MIN_USABLE_COMPS
        ? usableAsking
        : usableSold.length >= MIN_USABLE_COMPS
          ? usableSold
          : [];

  const factors = confidenceFactors(subject, comps, basisSet);

  if (basisSet.length < MIN_USABLE_COMPS) {
    return {
      status: "insufficient",
      compsFound: comps.length,
      usableCount: usable.length,
      askingCount,
      soldCount,
      basis: null,
      rangeLow: null,
      rangeHigh: null,
      median: null,
      subjectPrice: subject.price,
      differenceLow: null,
      differenceHigh: null,
      direction: null,
      confidence: "low",
      confidenceFactors: factors,
    };
  }

  const prices = basisSet.map((c) => c.price).sort((a, b) => a - b);
  const rangeLow = roundMoney(percentile(prices, 0.25));
  const rangeHigh = roundMoney(percentile(prices, 0.75));
  const median = roundMoney(percentile(prices, 0.5));

  let direction: CompsSummary["direction"] = null;
  let differenceLow: number | null = null;
  let differenceHigh: number | null = null;
  if (subject.price != null) {
    if (subject.price < rangeLow) {
      direction = "below";
      differenceLow = roundMoney(rangeLow - subject.price);
      differenceHigh = roundMoney(rangeHigh - subject.price);
    } else if (subject.price > rangeHigh) {
      direction = "above";
      differenceLow = roundMoney(subject.price - rangeHigh);
      differenceHigh = roundMoney(subject.price - rangeLow);
    } else {
      direction = "within";
      differenceLow = 0;
      differenceHigh = 0;
    }
  }

  return {
    status: "sufficient",
    compsFound: comps.length,
    usableCount: usable.length,
    askingCount,
    soldCount,
    basis: basisSet[0].priceKind,
    rangeLow,
    rangeHigh,
    median,
    subjectPrice: subject.price,
    differenceLow,
    differenceHigh,
    direction,
    confidence: gradeConfidence(factors, basisSet.length),
    confidenceFactors: factors,
  };
}

/**
 * Evidence-based confidence inputs. Every factor is an observable property of
 * the comp set, so "High" can never come from model self-assurance.
 */
function confidenceFactors(subject: CompSubject, comps: Comp[], basisSet: Comp[]): ConfidenceFactor[] {
  const factors: ConfidenceFactor[] = [];
  const n = basisSet.length;
  factors.push({
    label: "Usable Comps",
    detail: `${n} Comparable ${n === 1 ? "Listing" : "Listings"} Backed The Range`,
    state: n >= 8 ? "strong" : n >= 5 ? "fair" : "weak",
  });

  const avgSim = n ? Math.round(basisSet.reduce((s, c) => s + c.similarity, 0) / n) : 0;
  factors.push({
    label: "Similarity",
    detail: n ? `${avgSim}% Average Similarity` : "No Comparable Listings To Measure",
    state: avgSim >= 88 ? "strong" : avgSim >= 78 ? "fair" : "weak",
  });

  const withGeo = basisSet.filter((c) => c.distanceMiles != null);
  const radius = subject.radiusMiles ?? 250;
  const near = withGeo.filter((c) => (c.distanceMiles ?? Infinity) <= radius).length;
  factors.push({
    label: "Geographic Relevance",
    detail: withGeo.length
      ? `${near} Of ${withGeo.length} Within ${radius} Miles`
      : "No Comp Distances Provided",
    state: !withGeo.length ? "weak" : near / withGeo.length >= 0.8 ? "strong" : near / withGeo.length >= 0.5 ? "fair" : "weak",
  });

  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const dated = basisSet.filter((c) => c.observedAt && Number.isFinite(new Date(c.observedAt).getTime()));
  const recent = dated.filter((c) => new Date(c.observedAt!).getTime() >= cutoff).length;
  factors.push({
    label: "Recency",
    detail: dated.length
      ? `${recent} Of ${dated.length} Seen In The Last ${RECENT_DAYS} Days`
      : "No Comp Dates Provided",
    state: !dated.length ? "weak" : recent / dated.length >= 0.8 ? "strong" : recent / dated.length >= 0.5 ? "fair" : "weak",
  });

  const rules = compRules(subject.category);
  const tracked = rules.fields.length;
  const completeness = n
    ? basisSet.reduce((s, c) => {
        const filled = rules.fields.filter(
          (f) => c.attributes[f.key] !== undefined && c.attributes[f.key] !== "",
        ).length;
        return s + filled / Math.max(1, tracked);
      }, 0) / n
    : 0;
  factors.push({
    label: "Attribute Completeness",
    detail: n
      ? `${Math.round(completeness * 100)}% Of Tracked Attributes Present On Comps`
      : "Nothing To Measure",
    state: completeness >= 0.7 ? "strong" : completeness >= 0.45 ? "fair" : "weak",
  });

  const sold = basisSet.filter((c) => c.priceKind === "sold").length;
  factors.push({
    label: "Source Quality",
    detail: sold
      ? `${sold} Verified Sold ${sold === 1 ? "Price" : "Prices"} In The Range`
      : `${comps.length ? "Active Asking Prices Only" : "No Comp Sources Returned Data"}`,
    state: sold >= MIN_SOLD_FOR_BASIS ? "strong" : sold > 0 ? "fair" : "weak",
  });

  return factors;
}

function gradeConfidence(factors: ConfidenceFactor[], usableCount: number): CompsConfidence {
  const score = factors.reduce(
    (s, f) => s + (f.state === "strong" ? 1 : f.state === "fair" ? 0.5 : 0),
    0,
  ) / Math.max(1, factors.length);
  // Count gates the ceiling: a tiny comp set is never "High", however clean.
  if (usableCount >= 8 && score >= 0.75) return "high";
  if (usableCount >= 5 && score >= 0.6) return "medium";
  if (usableCount >= MIN_USABLE_COMPS && score >= 0.45) return "medium";
  return "low";
}

/* ------------------------------------------------------------------ display */

export function compsCtaLabel(compsFound: number | null): string {
  if (compsFound == null) return "Check Comps";
  if (compsFound === 0) return "View Comps";
  return `View ${compsFound} Comp${compsFound === 1 ? "" : "s"}`;
}

export function rangeLabel(s: CompsSummary): string {
  if (s.rangeLow == null || s.rangeHigh == null) return "Not Available";
  if (s.rangeLow === s.rangeHigh) return formatMoney(s.rangeLow);
  return `${formatMoney(s.rangeLow)} – ${formatMoney(s.rangeHigh)}`;
}

export const COMP_BASIS_LABEL: Record<CompPriceKind, string> = {
  asking: "Active Asking Comps",
  sold: "Sold Comps",
};

/**
 * "$2,700 – $3,600 Below Comparable Range". Never Profit / Expected Profit:
 * LeadTrace does not know repair, transaction, tax or transport costs.
 */
export function marketDifferenceLabel(s: CompsSummary): string | null {
  if (s.direction == null || s.differenceLow == null || s.differenceHigh == null) return null;
  if (s.direction === "within") return "Within Comparable Range";
  const lo = Math.min(s.differenceLow, s.differenceHigh);
  const hi = Math.max(s.differenceLow, s.differenceHigh);
  const amount = lo === hi ? formatMoney(lo) : `${formatMoney(lo)} – ${formatMoney(hi)}`;
  return `${amount} ${s.direction === "below" ? "Below" : "Above"} Comparable Range`;
}

export function compSubjectLine(subject: CompSubject): string[] {
  const parts: string[] = [];
  const rules = compRules(subject.category);
  for (const f of rules.fields) {
    const v = subject.attributes[f.key];
    if (v === undefined || v === "") continue;
    if (f.key === "mileage") {
      const n = num(v);
      if (n != null) parts.push(n >= 1000 ? `${Math.round(n / 1000)}k Miles` : `${n} Miles`);
      continue;
    }
    if (f.key === "hours") {
      const n = num(v);
      if (n != null) parts.push(`${n.toLocaleString("en-US")} Hours`);
      continue;
    }
    if (["make", "model", "trim", "year"].includes(f.key)) continue;
    parts.push(String(v).replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  if (subject.price != null) parts.push(`${formatMoney(subject.price)} Asking`);
  return parts.slice(0, 4);
}

/** Category attribute keys we surface on a comp row, in display order. */
export function compDisplayFields(category: MarketplaceCategory): CompField[] {
  return compRules(category).fields;
}
