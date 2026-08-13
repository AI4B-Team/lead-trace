/**
 * Distress Feed — shared, browser-safe config.
 *
 * The Distress Feed is NOT a job a customer runs. It is one continuously
 * maintained dataset that we pull nightly, county by county, and that every
 * customer queries. That distinction drives everything here: cost of goods is
 * per pull (one pull of Hillsborough probate serves every customer who wants
 * Hillsborough probate), so the feed itself is free to browse and credits are
 * only ever charged when a record is pulled into the customer's own leads and
 * enriched or skip traced.
 */

export type DistressRecordType =
  | "probate"
  | "pre_foreclosure"
  | "tax_delinquent"
  | "tax_deed"
  | "tax_lien"
  | "vacancy"
  | "lien"
  | "code_violation"
  | "eviction"
  | "demolition"
  | "surplus_funds";

export const RECORD_TYPES: Array<{
  id: DistressRecordType;
  label: string;
  slug: string;
  blurb: string;
  /** Not published on any portal — obtained through public records requests. */
  requestOnly?: boolean;
}> = [
  { id: "probate", label: "Probate", slug: "probate", blurb: "New estate filings. The heirs rarely want the house, and they are almost never marketed to first." },
  { id: "pre_foreclosure", label: "Pre-Foreclosure / Lis Pendens", slug: "pre-foreclosure", blurb: "The lender has filed. Months of runway before the auction date." },
  { id: "tax_deed", label: "Tax Deed / Delinquency", slug: "tax-deed", blurb: "Unpaid property tax, escalating toward a tax deed sale with a published auction date." },
  { id: "tax_lien", label: "Tax Liens", slug: "tax-liens", blurb: "Government tax liens recorded against the parcel — the debt that precedes a tax deed sale." },
  { id: "tax_delinquent", label: "Tax Delinquent", slug: "tax-delinquent", blurb: "Owners recently behind on property tax, before a lien or deed sale is filed." },
  { id: "vacancy", label: "Vacant / Zombie Properties", slug: "vacant-properties", blurb: "Confirmed vacant and abandoned homes. Nobody is living there and nobody is maintaining it." },
  { id: "lien", label: "Recorder Liens", slug: "liens", blurb: "Judgment, mechanic's, HOA and municipal liens recorded against the parcel." },
  { id: "code_violation", label: "Code Violations", slug: "code-violations", blurb: "Open cases on the property. Deferred maintenance with a paper trail and a deadline." },
  { id: "eviction", label: "Evictions", slug: "evictions", blurb: "Landlords at the end of their patience. A tired-landlord signal you cannot buy anywhere else.", requestOnly: true },
  { id: "surplus_funds", label: "Surplus Funds", slug: "surplus-funds", blurb: "Auction overages and unclaimed excess proceeds. The former owner is entitled to the difference and usually has no idea." },
  { id: "demolition", label: "Demolition Orders / Notice To Vacate", slug: "demolition-orders", blurb: "Structures ordered demolished or vacated. The most distressed record that exists.", requestOnly: true },
];

export function recordTypeBySlug(slug: string) {
  return RECORD_TYPES.find((r) => r.slug === slug.toLowerCase());
}
export function recordTypeById(id: string) {
  return RECORD_TYPES.find((r) => r.id === id);
}
export function recordTypeLabel(id: string): string {
  return recordTypeById(id)?.label ?? id.replace(/_/g, " ");
}

/** URL-safe county slug. "St. Johns" -> "st-johns". */
export function countySlug(county: string): string {
  return county.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Best-effort inverse: slug back to a display name for headings. */
export function countyFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Stable feed key for a county while real FIPS codes are still being filled in. */
export function countyKey(state: string, county: string): string {
  return `${state.toLowerCase()}-${countySlug(county)}`;
}

/**
 * Owner masking for every public (unauthenticated) surface. The database
 * already truncates the surname; this is the display-side guarantee.
 */
export function maskOwner(name: string | null | undefined): string {
  const value = (name ?? "").trim();
  if (!value) return "Owner";
  const parts = value.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const surname = last.length <= 2 ? last : `${last.charAt(0)}.`;
  return [...parts.slice(0, -1), surname].join(" ");
}

export const FEED_PATH = "/distress-feed";

export function countyPath(state: string, county: string): string {
  return `${FEED_PATH}/counties/${state.toLowerCase()}/${countySlug(county)}`;
}
export function statePath(state: string): string {
  return `${FEED_PATH}/counties/${state.toLowerCase()}`;
}
export function guidePath(state: string, county: string, recordType: string): string {
  const slug = recordTypeById(recordType)?.slug ?? recordType;
  return `${FEED_PATH}/guides/${state.toLowerCase()}/${countySlug(county)}/${slug}`;
}

export function countyTitle(county: string, state: string): string {
  return `${county} County, ${state.toUpperCase()} — Probate, Foreclosure & Tax Deed Leads`;
}

export function countyDescription(county: string, state: string, total: number): string {
  const volume = total > 0 ? `${total.toLocaleString()} filings` : "Coverage in progress";
  return `${volume} for ${county} County, ${state.toUpperCase()}. Probate, pre-foreclosure, tax deed, liens, code violations and evictions — pulled nightly, enriched, DNC scrubbed and skip traced.`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatAmount(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

/** Row shapes returned by the public feed reads (kept here so route files can
 * annotate loader data without importing a server-only module). */
export type FeedPreviewRow = {
  record_type: string;
  filed_date: string | null;
  owner_masked: string;
  property_city: string | null;
  property_zip: string | null;
  amount: number | null;
  status: string | null;
};
export type FeedStateRow = {
  state: string;
  counties: number;
  total_records: number;
  new_this_week: number;
  last_pull_at: string | null;
};
export type FeedCountyRow = {
  county: string;
  fips: string | null;
  total_records: number;
  new_this_week: number;
  record_types: string[];
  last_pull_at: string | null;
};
export type FeedGuideRow = {
  fips: string;
  state: string;
  county: string;
  record_type: string;
  title: string | null;
  portal_url: string;
  intro: string | null;
  steps: Array<{ heading?: string; body: string }>;
  fields: string[];
  notes: string | null;
};
