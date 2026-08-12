import { z } from "zod";
import { CONFIDENCE_LEVELS, ESCHEAT_BUCKETS, SALE_TYPES } from "./feed.shared";

export const surplusFiltersSchema = z.object({
  workspaceId: z.string().uuid().nullable().default(null),
  states: z.array(z.string().length(2)).default([]),
  counties: z.array(z.string().min(2)).default([]),
  saleTypes: z.array(z.enum(SALE_TYPES)).default([]),
  minAmount: z.number().nonnegative().nullable().default(null),
  maxAmount: z.number().nonnegative().nullable().default(null),
  saleDateFrom: z.string().min(10).nullable().default(null),
  saleDateTo: z.string().min(10).nullable().default(null),
  escheatBuckets: z
    .array(z.enum(ESCHEAT_BUCKETS.map((b) => b.value) as [string, ...string[]]))
    .default([]),
  confidence: z.array(z.enum(CONFIDENCE_LEVELS)).default([]),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(25).max(200).default(50),
});

export type SurplusFilters = z.infer<typeof surplusFiltersSchema>;

/** Surplus column profile for CSV export. */
export const SURPLUS_EXPORT_COLUMNS = [
  { key: "case_number", label: "Case Number" },
  { key: "property_address", label: "Property Address" },
  { key: "county_name", label: "County" },
  { key: "state_code", label: "State" },
  { key: "parcel_id", label: "Parcel ID" },
  { key: "owner_of_record", label: "Owner Of Record" },
  { key: "sale_type", label: "Sale Type" },
  { key: "sale_date", label: "Sale Date" },
  { key: "opening_bid", label: "Opening Bid" },
  { key: "judgment_amount", label: "Judgment Amount" },
  { key: "winning_bid", label: "Winning Bid" },
  { key: "surplus_amount", label: "Surplus Amount" },
  { key: "surplus_basis", label: "Surplus Basis" },
  { key: "confidence", label: "Confidence" },
  { key: "days_to_escheat", label: "Days To Escheat" },
  { key: "escheat_date", label: "Escheat Date" },
  { key: "claim_deadline", label: "Claim Deadline" },
  { key: "disbursement_status", label: "Disbursement Status" },
  { key: "fee_cap_percent", label: "Fee Cap %" },
  { key: "fee_cap_citation", label: "Fee Cap Citation" },
  { key: "source_registry", label: "Source" },
  { key: "source_url", label: "Source URL" },
  { key: "first_seen_at", label: "First Seen" },
  { key: "confirmed_at", label: "Clerk Confirmed At" },
] as const;