/**
 * Category-specific attribute extraction from listing text.
 *
 * Deterministic first, AI second (see extract.server.ts). Every extracted value
 * carries a confidence, and nothing is ever guessed: if the listing does not
 * state a value, the attribute is simply absent so the matcher reports it as
 * `unknown` rather than false.
 *
 * Categories declare their own attribute keys — no category is forced into the
 * vehicle schema.
 */
import type { MarketplaceCategory } from "./catalog.shared";
import type { ExtractedAttributes, ExtractionConfidence } from "./match.shared";

/** Attribute keys the AI extractor should try to fill, per category. */
export const EXTRACTION_FIELDS: Record<MarketplaceCategory, string[]> = {
  vehicles: [
    "year", "make", "model", "trim", "mileage", "title_status", "condition",
    "transmission", "fuel_type", "seller_type", "vin", "known_issues",
  ],
  electronics: [
    "brand", "model", "generation", "storage", "carrier", "lock_status",
    "condition", "seller_type",
  ],
  furniture: ["brand", "item_type", "material", "dimensions", "condition", "seller_type"],
  tools: ["brand", "tool_type", "power_source", "condition", "kit_contents", "seller_type"],
  heavy_equipment: [
    "make", "model", "year", "hours", "equipment_type", "operating_condition",
    "attachments", "seller_type",
  ],
  appliances: ["brand", "appliance_type", "fuel_type", "condition", "dimensions", "seller_type"],
  collectibles: ["item_type", "era", "grade", "condition", "authentication", "seller_type"],
  fashion: ["brand", "item_type", "size", "condition", "authentication", "seller_type"],
  real_estate: ["property_type", "beds", "baths", "sqft", "year_built", "lot_size", "seller_type"],
  other: ["item_type", "brand", "model", "condition", "seller_type"],
};

function put(
  out: ExtractedAttributes,
  key: string,
  value: string | number,
  confidence: ExtractionConfidence,
) {
  if (out[key] !== undefined) return;
  if (value === "" || value == null) return;
  out[key] = { value, confidence };
}

/**
 * Regex/keyword extraction that costs nothing. Only patterns that are
 * unambiguous in real listing copy are included.
 */
export function extractDeterministic(
  category: MarketplaceCategory,
  title: string,
  description: string | null,
  sourceAttributes: Record<string, string | number> = {},
): ExtractedAttributes {
  const out: ExtractedAttributes = {};
  // Structured fields the marketplace itself provided are the most reliable.
  for (const [k, v] of Object.entries(sourceAttributes)) {
    put(out, k, v, "high");
  }

  const text = `${title} ${description ?? ""}`;
  const lower = text.toLowerCase();

  const year = title.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (year && (category === "vehicles" || category === "heavy_equipment")) {
    put(out, "year", Number(year[1]), "high");
  }

  if (category === "vehicles" || category === "heavy_equipment") {
    const miles = lower.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(?:mi|mile|miles|k\s*miles)?\b(?=[^\n]{0,12}(?:mi|mile))/);
    const kMiles = lower.match(/\b(\d{1,3})\s*k\s*(?:mi|miles)\b/);
    if (kMiles) put(out, "mileage", Number(kMiles[1]) * 1000, "medium");
    else if (miles) put(out, "mileage", Number(miles[1].replace(/,/g, "")), "medium");

    const hours = lower.match(/\b(\d{1,3}(?:,\d{3})*|\d{3,6})\s*(?:hrs?|hours)\b/);
    if (hours && category === "heavy_equipment") {
      put(out, "hours", Number(hours[1].replace(/,/g, "")), "medium");
    }

    if (/\bclean\s*(?:and\s*clear\s*)?title\b/.test(lower)) put(out, "title_status", "clean", "high");
    else if (/\bsalvage\s*title\b/.test(lower)) put(out, "title_status", "salvage", "high");
    else if (/\brebuilt\s*title\b/.test(lower)) put(out, "title_status", "rebuilt", "high");

    if (/\b(automatic|auto trans)\b/.test(lower)) put(out, "transmission", "automatic", "medium");
    else if (/\b(manual|stick shift|5[- ]speed|6[- ]speed manual)\b/.test(lower)) {
      put(out, "transmission", "manual", "medium");
    }

    if (/\b(diesel)\b/.test(lower)) put(out, "fuel_type", "diesel", "high");
    else if (/\b(electric|ev only)\b/.test(lower)) put(out, "fuel_type", "electric", "medium");
    else if (/\b(hybrid)\b/.test(lower)) put(out, "fuel_type", "hybrid", "high");

    const vin = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (vin) put(out, "vin", vin[1].toUpperCase(), "high");
  }

  if (category === "electronics") {
    const storage = lower.match(/\b(\d{2,4})\s*(gb|tb)\b/);
    if (storage) put(out, "storage", `${storage[1]}${storage[2].toUpperCase()}`, "high");
    if (/\bunlocked\b/.test(lower)) put(out, "lock_status", "unlocked", "high");
    else if (/\b(locked|carrier locked|icloud locked)\b/.test(lower)) {
      put(out, "lock_status", "locked", "high");
    }
  }

  if (category === "real_estate") {
    const beds = lower.match(/\b(\d)\s*(?:bd|bed|beds|bedroom|bedrooms|br)\b/);
    if (beds) put(out, "beds", Number(beds[1]), "high");
    const baths = lower.match(/\b(\d(?:\.5)?)\s*(?:ba|bath|baths|bathroom|bathrooms)\b/);
    if (baths) put(out, "baths", Number(baths[1]), "high");
    const sqft = lower.match(/\b(\d{3,5}(?:,\d{3})?)\s*(?:sq\.?\s?ft|sqft|square feet)\b/);
    if (sqft) put(out, "sqft", Number(sqft[1].replace(/,/g, "")), "high");
  }

  // Seller type is stated the same way across every category.
  if (/\b(dealer|dealership|we finance|stock\s*#|licensed dealer)\b/.test(lower)) {
    put(out, "seller_type", "dealer", "medium");
  } else if (/\b(private (?:party|seller|owner)|by owner|owner selling)\b/.test(lower)) {
    put(out, "seller_type", "private", "medium");
  }

  if (/\bbrand new\b|\bnew in box\b|\bnib\b|\bsealed\b/.test(lower)) put(out, "condition", "new", "high");
  else if (/\blike new\b|\bopen box\b/.test(lower)) put(out, "condition", "like new", "medium");
  else if (/\bfor parts\b|\bnot working\b|\bdoes not (?:run|work)\b|\bparts only\b/.test(lower)) {
    put(out, "condition", "for parts", "high");
  }

  return out;
}

/** Neutral, evidence-backed seller-language signals we allow ourselves to name. */
export const SELLER_SIGNAL_PATTERNS: {
  key: string;
  label: string;
  test: RegExp;
}[] = [
  { key: "urgency", label: "Stated Urgency", test: /\b(must sell|need(?:s)? gone|asap|moving|today only|leaving town|deployment)\b/i },
  { key: "offers", label: "Open To Offers", test: /\b(obo|or best offer|make (?:me )?an offer|negotiable|open to offers)\b/i },
  { key: "firm_price", label: "Price Stated As Firm", test: /\b(price is firm|firm on price|no lowballs?|firm)\b/i },
  { key: "availability", label: "Availability Stated", test: /\b(still available|first come first serve|pending pickup|sale pending|sold pending)\b/i },
  { key: "condition_disclosure", label: "Condition Disclosed", test: /\b(needs?|issue|check engine|leak|rust|scratch|dent|crack|as[- ]is|repair)\b/i },
  { key: "records", label: "Records Mentioned", test: /\b(service records?|maintenance records?|receipts|carfax|clean carfax)\b/i },
];

export function extractSellerSignals(
  title: string,
  description: string | null,
): { key: string; label: string; evidence: string | null }[] {
  const text = `${title}. ${description ?? ""}`;
  const out: { key: string; label: string; evidence: string | null }[] = [];
  for (const p of SELLER_SIGNAL_PATTERNS) {
    const m = text.match(p.test);
    if (!m) continue;
    const idx = Math.max(0, (m.index ?? 0) - 30);
    const evidence = text.slice(idx, Math.min(text.length, (m.index ?? 0) + m[0].length + 30)).trim();
    out.push({ key: p.key, label: p.label, evidence: evidence || null });
  }
  return out;
}

/** Missing information is a fact worth surfacing — but never as a negative. */
export function missingFields(
  category: MarketplaceCategory,
  attrs: ExtractedAttributes,
): string[] {
  return (EXTRACTION_FIELDS[category] ?? []).filter((k) => attrs[k] === undefined);
}
