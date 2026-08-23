/**
 * COMP SOURCES — deliberately separate from MARKETPLACE SOURCES.
 *
 *   Marketplace Sources answer: WHERE ARE WE LOOKING FOR THE ITEM?
 *   Comp Sources answer:        WHAT DATA SHOULD WE USE TO UNDERSTAND VALUE?
 *
 * A Facebook Marketplace lead can legitimately be valued from other sources,
 * so the two registries never share keys or lifecycles. Category-specific
 * valuation feeds (vehicle books, sold-price APIs) plug in here later without
 * touching the ranking engine or the UI.
 */
import type { MarketplaceCategory } from "./catalog.shared";
import type { CompPriceKind, CompSourceKind } from "./comps.shared";

export type CompSource = {
  key: string;
  label: string;
  /** `live` only when a real adapter actually returns comps today. */
  status: "live" | "planned";
  kind: CompSourceKind;
  /** Asking prices and verified sold prices are never treated as equivalent. */
  priceKind: CompPriceKind;
  /** Empty means every category. */
  categories?: MarketplaceCategory[];
  note: string;
};

export const COMP_SOURCES: CompSource[] = [
  {
    key: "leadtrace_observed",
    label: "LeadTrace Observed Listings",
    status: "live",
    kind: "observed_listing",
    priceKind: "asking",
    note: "Listings LeadTrace has already collected for this workspace. Asking prices, not sold prices.",
  },
  {
    key: "marketplace_sold",
    label: "Marketplace Sold Records",
    status: "planned",
    kind: "sold_record",
    priceKind: "sold",
    note: "Verified sold prices, used in preference to asking prices once enough are available.",
  },
  {
    key: "vehicle_valuation",
    label: "Vehicle Valuation Feed",
    status: "planned",
    kind: "valuation_feed",
    priceKind: "sold",
    categories: ["vehicles"],
    note: "Category-specific vehicle market data keyed on VIN, trim and mileage.",
  },
  {
    key: "equipment_auction",
    label: "Equipment Auction Results",
    status: "planned",
    kind: "sold_record",
    priceKind: "sold",
    categories: ["heavy_equipment", "tools"],
    note: "Auction hammer prices for machinery and large tools.",
  },
];

export function compSource(key: string): CompSource | null {
  return COMP_SOURCES.find((s) => s.key === key) ?? null;
}

export function compSourceLabel(key: string): string {
  return compSource(key)?.label ?? key;
}

export function liveCompSources(category: MarketplaceCategory): CompSource[] {
  return COMP_SOURCES.filter(
    (s) => s.status === "live" && (!s.categories || s.categories.includes(category)),
  );
}

export function plannedCompSources(category: MarketplaceCategory): CompSource[] {
  return COMP_SOURCES.filter(
    (s) => s.status === "planned" && (!s.categories || s.categories.includes(category)),
  );
}
