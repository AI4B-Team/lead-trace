// ---------------------------------------------------------------------------
// Per-template field schemas + honest adapter availability.
//
// The List Builder panel renders from these schemas instead of a hardcoded
// business/records/upload form: Zillow wants geography + listing filters,
// LinkedIn wants a keyword + audience size, Contact Details wants a URL.
// Slot gating and the assembling checklist read the SAME schema, so
// "waiting on you" always matches the fields that template actually needs.
// ---------------------------------------------------------------------------

import { primaryCategory, templateSourceType, type Template, type TemplateCategory } from "@/lib/templates";
import type { JobSpec } from "@/lib/assistant.shared";
import {
  INTERNATIONAL_TEMPLATE_COUNTRY, JOB_BOARD_TEMPLATE_IDS, US_REALESTATE_PORTAL_IDS,
  templateOutputType, type OutputType,
} from "@/lib/pipeline-options";

/** Every field the builder knows how to render. */
export type BuilderField =
  | "niche"
  | "keyword"
  | "recordType"
  | "state"
  | "counties"
  | "city"
  | "country"
  | "contactTarget"
  | "recency"
  | "url"
  | "audienceFilter"
  | "listingFilter"
  /** Plain-language condition criteria scored from imagery (Street Scan). */
  | "visualCriteria"
  /** The data filter that runs before imagery is bought (Street Scan). */
  | "buyBox"
  | "upload";

export type AdapterStatus = "live" | "beta" | "requested";

/** Site scrapers take a URL, not a geography. */
const URL_TEMPLATES = new Set(["contact-details", "universal-crawl", "web-scraper", "site-crawler"]);

/** City-shaped geography: nobody searches apartments or hotels by county. */
const CITY_TEMPLATES = ["apartments", "foursquare", "booking", "airbnb", "hotels", "loopnet"] as const;

/** Software / vendor review sources. The lead is the vendor company. */
const VENDOR_REVIEW_TEMPLATES = ["g2", "capterra", "trustpilot", "trustradius"] as const;

/** Templates whose fields don't follow their catalog category. */
const SCHEMA_BY_ID: Record<string, BuilderField[]> = {
  // Street Scan reuses State + Counties for its market, adds the buy box and
  // the visual criteria the assistant inferred. No second prompt box.
  "street-scan": ["state", "counties", "buyBox"],
  linkedin: ["keyword", "audienceFilter"],
  crunchbase: ["keyword", "audienceFilter"],
  // Marketplace sellers: keyword + the marketplace's country.
  amazon: ["keyword", "country"],
  ebay: ["keyword", "country"],
  etsy: ["keyword", "country"],
  walmart: ["keyword", "country"],
  shopify: ["keyword", "country"],
  ...Object.fromEntries(CITY_TEMPLATES.map((id) => [id, ["niche", "city"] as BuilderField[]])),
  ...Object.fromEntries(VENDOR_REVIEW_TEMPLATES.map((id) => [id, ["keyword", "audienceFilter"] as BuilderField[]])),
  // Non-US portals and marketplaces take a country, never a US state/county.
  ...Object.fromEntries(
    Object.keys(INTERNATIONAL_TEMPLATE_COUNTRY).map((id) => [id, ["keyword", "country"] as BuilderField[]]),
  ),
  // US real-estate portals: whose details are we after, and where.
  ...Object.fromEntries(
    US_REALESTATE_PORTAL_IDS.map((id) => [
      id,
      ["contactTarget", "state", "counties", "listingFilter"] as BuilderField[],
    ]),
  ),
  // Job boards: the employer is the lead, and freshness is the buying trigger.
  ...Object.fromEntries(
    JOB_BOARD_TEMPLATE_IDS.map((id) => [id, ["keyword", "state", "recency"] as BuilderField[]]),
  ),
};

/** Per-template label overrides for the generic filter fields. */
const FILTER_LABEL_BY_ID: Record<string, string> = {
  crunchbase: "Funding / Size Filter",
  g2: "Rating / Review-Count Filter",
  capterra: "Rating / Review-Count Filter",
  trustpilot: "Rating / Review-Count Filter",
  trustradius: "Rating / Review-Count Filter",
};

export function filterFieldLabel(templateId?: string | null): string | null {
  return (templateId && FILTER_LABEL_BY_ID[templateId]) || null;
}

/** Job-board runs dedupe by company, because the employer is the lead. */
export function dedupesByCompany(templateId?: string | null): boolean {
  return Boolean(templateId && JOB_BOARD_TEMPLATE_IDS.includes(templateId));
}

/** Output type for a template, re-exported so the builder has one import. */
export function templateOutput(t?: Template | null): OutputType {
  return templateOutputType(t?.id ?? null);
}

const BY_CATEGORY: Record<TemplateCategory, BuilderField[]> = {
  upload: ["upload"],
  records: ["recordType", "state", "counties", "recency"],
  business: ["niche", "state", "counties"],
  directories: ["niche", "state", "counties"],
  search: ["keyword", "state", "counties"],
  // Marketplace Deals runs its own setup flow, not the standard builder fields.
  marketplace: ["keyword"],
  reviews: ["niche", "state", "counties"],
  realestate: ["state", "counties", "listingFilter"],
  social: ["keyword", "audienceFilter"],
  ecommerce: ["keyword"],
  jobs: ["keyword", "state"],
  travel: ["keyword", "state"],
  finance: ["keyword", "state"],
  education: ["keyword", "state"],
  news: ["keyword"],
  sports: ["keyword"],
};

/** Adapters wired to the real pipeline today. */
const LIVE_CATEGORIES = new Set<TemplateCategory>(["business", "records", "upload"]);

export function templateAdapterStatus(t: Template): AdapterStatus {
  if (t.adapterStatus) return t.adapterStatus;
  // Anything already flagged Beta in the catalog has no live adapter either,
  // and site scrapers aren't wired to the pipeline yet.
  if (t.beta || URL_TEMPLATES.has(t.id)) return "beta";
  if (t.categories.some((c) => LIVE_CATEGORIES.has(c))) return "live";
  return "beta";
}

export function templateFieldSchema(t: Template): BuilderField[] {
  if (t.fieldSchema?.length) return t.fieldSchema as BuilderField[];
  if (URL_TEMPLATES.has(t.id)) return ["url"];
  if (SCHEMA_BY_ID[t.id]) return SCHEMA_BY_ID[t.id];
  return BY_CATEGORY[primaryCategory(t)] ?? ["keyword", "state", "counties"];
}

/** Fields for a spec with no template selected (the ?source= panel path). */
export function fieldsForSourceType(source: JobSpec["sourceType"]): BuilderField[] {
  if (source === "upload") return BY_CATEGORY.upload;
  if (source === "records") return BY_CATEGORY.records;
  if (source === "business") return BY_CATEGORY.business;
  if (source === "street_scan") return ["state", "counties", "buyBox"];
  return [];
}

/** The schema in force: template first, otherwise the raw source type. */
export function fieldsForSpec(spec: JobSpec, template?: Template | null): BuilderField[] {
  if (template) return templateFieldSchema(template);
  return fieldsForSourceType(spec.sourceType);
}

/** Optional fields never block Generate List. */
const OPTIONAL: BuilderField[] = ["recency", "audienceFilter", "listingFilter", "buyBox"];

export function isOptionalField(f: BuilderField): boolean {
  return OPTIONAL.includes(f);
}

export const FIELD_SLOT_LABEL: Record<BuilderField, string> = {
  niche: "Niche",
  keyword: "Keyword",
  recordType: "Record Type",
  state: "Location",
  counties: "Location",
  city: "City",
  country: "Country",
  contactTarget: "Contact Target",
  recency: "Recency",
  url: "URL",
  audienceFilter: "Audience Filter",
  listingFilter: "Listing Filter",
  visualCriteria: "Visual Criteria",
  buyBox: "Buy Box",
  upload: "File",
};

/** True when the spec already satisfies a given field. */
export function fieldFilled(f: BuilderField, spec: JobSpec, uploadReady: boolean): boolean {
  switch (f) {
    case "upload":
      return uploadReady;
    case "niche":
    case "keyword":
      return spec.niches.length > 0;
    case "recordType":
      return Boolean(spec.recordType);
    case "state":
    case "counties":
      return (spec.states.length > 0 || Boolean(spec.state)) || spec.counties.length > 0;
    case "city":
      return Boolean(spec.city && spec.city.trim());
    case "country":
      return Boolean(spec.country && spec.country.trim());
    case "contactTarget":
      return Boolean(spec.contactTarget);
    case "url":
      return Boolean(spec.targetUrl && /\./.test(spec.targetUrl));
    case "visualCriteria":
      return spec.visualCriteria.length > 0;
    default:
      return true;
  }
}

/** Adapter status for whatever is currently selected in the builder. */
export function specAdapterStatus(spec: JobSpec, template?: Template | null): AdapterStatus {
  if (template) return templateAdapterStatus(template);
  // No template: only the three wired source types can be chosen at all.
  return spec.sourceType ? "live" : "live";
}

/** A template can only reach the pipeline when its own source type is wired. */
export function templateRunnableSourceType(t: Template) {
  return templateSourceType(t);
}
