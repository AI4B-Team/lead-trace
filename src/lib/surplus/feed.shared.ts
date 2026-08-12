/**
 * Surplus Funds feed — shared vocabulary for the workspace-facing table.
 *
 * Every label here is customer-visible, so nothing is invented: a record is
 * either the clerk's own published amount or an amount derived from the auction
 * result, and a countdown only exists where the state publishes an escheat
 * window. A null countdown renders as an em dash, never as a guess.
 */

export const SALE_TYPES = ["tax_deed", "mortgage_foreclosure", "hoa_foreclosure"] as const;
export type SaleType = (typeof SALE_TYPES)[number];

export const SALE_TYPE_LABELS: Record<SaleType, string> = {
  tax_deed: "Tax Deed",
  mortgage_foreclosure: "Mortgage Foreclosure",
  hoa_foreclosure: "HOA Foreclosure",
};

export const CONFIDENCE_LEVELS = ["derived", "clerk_confirmed"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  derived: "Derived",
  clerk_confirmed: "Clerk Confirmed",
};

export const DISBURSEMENT_LABELS: Record<string, string> = {
  unclaimed: "Held By Clerk",
  claim_filed: "Claim Filed",
  disbursed: "Disbursed",
  escheated: "Escheated",
  unknown: "Status Unknown",
};

/**
 * Escheat buckets. Upper bound is exclusive so the ranges tile without gaps.
 * `max: null` means open-ended.
 */
export const ESCHEAT_BUCKETS = [
  { value: "lt30", label: "Under 30 Days", min: null, max: 30 },
  { value: "30_60", label: "30–60 Days", min: 30, max: 60 },
  { value: "60_90", label: "60–90 Days", min: 60, max: 90 },
  { value: "90_180", label: "90–180 Days", min: 90, max: 180 },
  { value: "gte180", label: "180+ Days", min: 180, max: null },
] as const;

export type EscheatBucket = (typeof ESCHEAT_BUCKETS)[number]["value"];

export interface SurplusFeedRecord {
  id: string;
  workspace_id: string | null;
  county_fips: string | null;
  county_name: string | null;
  state_code: string;
  case_number: string | null;
  sale_type: SaleType;
  property_address: string | null;
  property_city: string | null;
  property_zip: string | null;
  parcel_id: string | null;
  owner_of_record: string | null;
  sale_date: string | null;
  opening_bid: number | null;
  judgment_amount: number | null;
  winning_bid: number | null;
  surplus_amount: number;
  surplus_basis: "derived" | "clerk_published";
  confidence: Confidence;
  variance_pct: number | null;
  source_registry: string;
  source_url: string | null;
  disbursement_status: string | null;
  claim_deadline: string | null;
  deadline_from_clerk: boolean | null;
  escheat_date: string | null;
  days_to_escheat: number | null;
  fee_cap_percent: number | null;
  fee_cap_citation: string | null;
  escheat_destination: string | null;
  recovery_permitted: boolean | null;
  assignment_permitted: boolean | null;
  first_seen_at: string;
  confirmed_at: string | null;
}

/** Urgency tiers drive the countdown color. Null days = no tier. */
export function escheatTier(days: number | null): "critical" | "warning" | "normal" | null {
  if (days === null || days === undefined) return null;
  if (days < 30) return "critical";
  if (days <= 90) return "warning";
  return "normal";
}

export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatFeedDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}