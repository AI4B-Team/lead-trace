/**
 * Marketplace Deals — shared catalog (categories, sources, radius, criteria shape).
 *
 * Phase 1 is search definition only: a saved, workspace-scoped monitor spec.
 * No marketplace adapter is wired yet, so every source here is `planned` and the
 * UI must say so. Do not flip a source to `live` until a real backend
 * integration exists for it.
 */

export type MarketplaceCategory =
  | "vehicles"
  | "electronics"
  | "furniture"
  | "tools"
  | "heavy_equipment"
  | "appliances"
  | "collectibles"
  | "fashion"
  | "real_estate"
  | "other";

export const MARKETPLACE_CATEGORIES: { key: MarketplaceCategory; label: string }[] = [
  { key: "vehicles", label: "Vehicles" },
  { key: "electronics", label: "Electronics" },
  { key: "furniture", label: "Furniture" },
  { key: "tools", label: "Tools & Equipment" },
  { key: "heavy_equipment", label: "Heavy Equipment" },
  { key: "appliances", label: "Appliances" },
  { key: "collectibles", label: "Collectibles" },
  { key: "fashion", label: "Fashion & Sneakers" },
  { key: "real_estate", label: "Real Estate" },
  { key: "other", label: "Other / Anything" },
];

export function categoryLabel(key: string): string {
  return MARKETPLACE_CATEGORIES.find((c) => c.key === key)?.label ?? "Other / Anything";
}

export type MarketplaceSourceKey = "facebook" | "craigslist" | "offerup" | "kijiji" | "gumtree";

export type MarketplaceSource = {
  key: MarketplaceSourceKey;
  label: string;
  /** `live` only when a real adapter runs against the source. */
  status: "live" | "planned";
  /** Region note, shown so users don't pick a source that can't serve them. */
  region: string;
  /** Categories the source realistically carries; empty means all. */
  categories?: MarketplaceCategory[];
};

export const MARKETPLACE_SOURCES: MarketplaceSource[] = [
  { key: "facebook", label: "Facebook Marketplace", status: "planned", region: "US / CA / UK" },
  { key: "craigslist", label: "Craigslist", status: "planned", region: "US / CA" },
  { key: "offerup", label: "OfferUp", status: "planned", region: "US" },
  { key: "kijiji", label: "Kijiji", status: "planned", region: "Canada" },
  { key: "gumtree", label: "Gumtree", status: "planned", region: "UK / AU" },
];

export function sourceLabel(key: string): string {
  return MARKETPLACE_SOURCES.find((s) => s.key === key)?.label ?? key;
}

/** True only when at least one source has a real adapter behind it. */
export function anySourceLive(): boolean {
  return MARKETPLACE_SOURCES.some((s) => s.status === "live");
}

export function sourcesForCategory(category: MarketplaceCategory): MarketplaceSource[] {
  return MARKETPLACE_SOURCES.filter((s) => !s.categories || s.categories.includes(category));
}

export const RADIUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 10, label: "10 mi" },
  { value: 25, label: "25 mi" },
  { value: 50, label: "50 mi" },
  { value: 75, label: "75 mi" },
  { value: 100, label: "100 mi" },
  { value: 250, label: "250 mi" },
  { value: null, label: "Nationwide" },
];

export function radiusLabel(miles: number | null): string {
  return miles == null ? "Nationwide" : `${miles} miles`;
}

/**
 * Structured criteria are deliberately open-ended: a flat bag of attributes
 * plus the shared shopping fields. Categories declare which attributes they
 * care about, so adding a category never means touching the pipeline.
 */
export type MarketplaceCriteria = {
  /** Free-text "looking for" targets, e.g. ["Toyota Camry", "Honda Accord"]. */
  targets: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  keywords: string[];
  exclusions: string[];
  /** Category-specific attributes: year_min, mileage_max, storage, material… */
  attributes: Record<string, string | number>;
};

export const EMPTY_CRITERIA: MarketplaceCriteria = {
  targets: [],
  priceMin: null,
  priceMax: null,
  keywords: [],
  exclusions: [],
  attributes: {},
};

/** Attribute slots per category — labels drive the Review step and the AI prompt. */
export const CATEGORY_ATTRIBUTES: Record<MarketplaceCategory, { key: string; label: string }[]> = {
  vehicles: [
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "year_min", label: "Year From" },
    { key: "year_max", label: "Year To" },
    { key: "mileage_max", label: "Max Mileage" },
    { key: "title_status", label: "Title" },
    { key: "seller_type", label: "Seller" },
    { key: "transmission", label: "Transmission" },
  ],
  electronics: [
    { key: "brand", label: "Brand" },
    { key: "model", label: "Model" },
    { key: "generation", label: "Generation" },
    { key: "storage", label: "Storage" },
    { key: "condition", label: "Condition" },
    { key: "carrier", label: "Carrier" },
  ],
  furniture: [
    { key: "brand", label: "Brand" },
    { key: "item_type", label: "Item Type" },
    { key: "material", label: "Material" },
    { key: "dimensions", label: "Dimensions" },
    { key: "condition", label: "Condition" },
  ],
  tools: [
    { key: "brand", label: "Brand" },
    { key: "tool_type", label: "Tool Type" },
    { key: "power_source", label: "Power Source" },
    { key: "condition", label: "Condition" },
  ],
  heavy_equipment: [
    { key: "make", label: "Make" },
    { key: "equipment_type", label: "Equipment Type" },
    { key: "year_min", label: "Year From" },
    { key: "hours_max", label: "Max Hours" },
    { key: "condition", label: "Condition" },
  ],
  appliances: [
    { key: "brand", label: "Brand" },
    { key: "appliance_type", label: "Appliance Type" },
    { key: "fuel_type", label: "Fuel Type" },
    { key: "condition", label: "Condition" },
  ],
  collectibles: [
    { key: "item_type", label: "Item Type" },
    { key: "era", label: "Era" },
    { key: "grade", label: "Grade" },
    { key: "condition", label: "Condition" },
  ],
  fashion: [
    { key: "brand", label: "Brand" },
    { key: "item_type", label: "Item Type" },
    { key: "size", label: "Size" },
    { key: "condition", label: "Condition" },
  ],
  real_estate: [
    { key: "property_type", label: "Property Type" },
    { key: "beds_min", label: "Beds From" },
    { key: "baths_min", label: "Baths From" },
    { key: "sqft_min", label: "Sq Ft From" },
  ],
  other: [
    { key: "item_type", label: "Item Type" },
    { key: "brand", label: "Brand" },
    { key: "condition", label: "Condition" },
  ],
};

export function attributeLabel(category: MarketplaceCategory, key: string): string {
  const found = CATEGORY_ATTRIBUTES[category]?.find((a) => a.key === key);
  if (found) return found.label;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display polish: Title Case words, thousands separators on plain numbers. */
export function formatAttrValue(v: string | number): string {
  // Years (4-digit) stay bare so 2018 never renders as "2,018".
  if (typeof v === "number")
    return Number.isInteger(v) && v >= 1000 && v <= 9999 ? String(v) : v.toLocaleString("en-US");
  const trimmed = v.trim();
  // Years stay bare; longer numbers (mileage, hours) get separators.
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  if (/^\d{5,}$/.test(trimmed)) return Number(trimmed).toLocaleString("en-US");
  return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/** Neutral, descriptive default name — never resale/flip framing. */
export function suggestSearchName(
  category: MarketplaceCategory,
  criteria: MarketplaceCriteria,
): string {
  const brands = criteria.targets
    .map((t) => t.trim().split(/\s+/)[0])
    .filter(Boolean)
    .filter((b, i, arr) => arr.indexOf(b) === i)
    .slice(0, 2);
  if (brands.length) return `${brands.join(" & ")} Search`;
  const attr = criteria.attributes.item_type ?? criteria.attributes.brand;
  if (attr) return `${String(attr)} Search`;
  return `${categoryLabel(category)} Search`;
}

export type SummaryRow = { label: string; values: string[] };

/** Rows shown in Review Your Search and in the saved-search summary. */
export function criteriaSummary(
  category: MarketplaceCategory,
  criteria: MarketplaceCriteria,
  location: string | null,
  radiusMiles: number | null,
  sources: string[],
): SummaryRow[] {
  const rows: SummaryRow[] = [{ label: "Category", values: [categoryLabel(category)] }];
  if (criteria.targets.length) rows.push({ label: "Looking For", values: criteria.targets });

  const yMin = criteria.attributes.year_min;
  const yMax = criteria.attributes.year_max;
  if (yMin || yMax) {
    rows.push({ label: "Years", values: [[yMin, yMax].filter(Boolean).join("–")] });
  }

  for (const attr of CATEGORY_ATTRIBUTES[category] ?? []) {
    if (attr.key === "year_min" || attr.key === "year_max") continue;
    const v = criteria.attributes[attr.key];
    if (v === undefined || v === "" || v === null) continue;
    rows.push({ label: attr.label, values: [formatAttrValue(v)] });
  }
  // Attributes the AI invented outside the category slot list still show up.
  const known = new Set((CATEGORY_ATTRIBUTES[category] ?? []).map((a) => a.key));
  for (const [k, v] of Object.entries(criteria.attributes)) {
    if (known.has(k) || v === "" || v === null) continue;
    rows.push({ label: attributeLabel(category, k), values: [formatAttrValue(v)] });
  }

  if (criteria.priceMin != null) rows.push({ label: "Min Price", values: [formatMoney(criteria.priceMin)] });
  if (criteria.priceMax != null) rows.push({ label: "Max Price", values: [formatMoney(criteria.priceMax)] });
  if (location) rows.push({ label: "Location", values: [location] });
  rows.push({ label: "Radius", values: [radiusLabel(radiusMiles)] });
  if (sources.length) rows.push({ label: "Sources", values: sources.map(sourceLabel) });
  if (criteria.keywords.length) rows.push({ label: "Keywords", values: criteria.keywords });
  if (criteria.exclusions.length) rows.push({ label: "Excluded", values: criteria.exclusions });
  return rows;
}

/* ------------------------------------------------------------------ status */

export type MarketplaceStatusKey =
  | "active"
  | "paused"
  | "needs_attention"
  | "source_unavailable"
  | "setup_incomplete";

export type MarketplaceStatusDisplay = {
  key: MarketplaceStatusKey;
  label: string;
  tone: "success" | "muted" | "warn" | "danger";
  /** Why the search is in this state — shown under the badge, never invented. */
  detail: string | null;
};

/**
 * Truthful status. "Active" is only ever shown when a real source adapter is
 * running; until then a stored `active` row reads as Source Unavailable.
 */
export function searchStatus(s: {
  status: string;
  sources: string[];
  criteria: MarketplaceCriteria;
  attentionNote?: string | null;
}): MarketplaceStatusDisplay {
  if (s.status === "paused") {
    return { key: "paused", label: "Paused", tone: "muted", detail: "You paused this search." };
  }
  const hasCriteria =
    s.criteria.targets.length > 0 ||
    s.criteria.keywords.length > 0 ||
    Object.keys(s.criteria.attributes).length > 0;
  if (!s.sources.length || !hasCriteria) {
    return {
      key: "setup_incomplete",
      label: "Setup Incomplete",
      tone: "warn",
      detail: !s.sources.length ? "No marketplaces selected." : "No criteria to match on.",
    };
  }
  if (s.attentionNote) {
    return { key: "needs_attention", label: "Needs Attention", tone: "danger", detail: s.attentionNote };
  }
  const live = s.sources.filter((k) =>
    MARKETPLACE_SOURCES.some((m) => m.key === k && m.status === "live"),
  );
  if (!live.length) {
    return {
      key: "source_unavailable",
      label: "Source Unavailable",
      tone: "muted",
      detail: "No marketplace connection is live yet, so nothing is being collected.",
    };
  }
  return { key: "active", label: "Active", tone: "success", detail: null };
}

/** "2 Min Ago" — Title Case, never a bare timestamp in a card row. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "Never";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins} Min Ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} Hr Ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} Day${days === 1 ? "" : "s"} Ago`;
  return new Date(iso).toLocaleDateString("en-US");
}

/** Compact criteria lines for a search card: "2015–2021", "Under $8,000"… */
export function criteriaLines(category: MarketplaceCategory, criteria: MarketplaceCriteria): string[] {
  const lines: string[] = [];
  const yMin = criteria.attributes.year_min;
  const yMax = criteria.attributes.year_max;
  if (yMin && yMax) lines.push(`${yMin}–${yMax}`);
  else if (yMin) lines.push(`${yMin} & Newer`);
  else if (yMax) lines.push(`${yMax} & Older`);

  if (criteria.priceMin != null && criteria.priceMax != null) {
    lines.push(`${formatMoney(criteria.priceMin)}–${formatMoney(criteria.priceMax)}`);
  } else if (criteria.priceMax != null) lines.push(`Under ${formatMoney(criteria.priceMax)}`);
  else if (criteria.priceMin != null) lines.push(`Over ${formatMoney(criteria.priceMin)}`);

  const mileage = criteria.attributes.mileage_max;
  if (mileage) lines.push(`Under ${formatAttrValue(mileage)} Miles`);
  const hours = criteria.attributes.hours_max;
  if (hours) lines.push(`Under ${formatAttrValue(hours)} Hours`);

  for (const attr of CATEGORY_ATTRIBUTES[category] ?? []) {
    if (["year_min", "year_max", "mileage_max", "hours_max"].includes(attr.key)) continue;
    const v = criteria.attributes[attr.key];
    if (v === undefined || v === "" || v === null) continue;
    lines.push(attr.key === "title_status" ? `${formatAttrValue(v)} Title` : formatAttrValue(v));
  }
  return lines.slice(0, 6);
}
