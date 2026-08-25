// ---------------------------------------------------------------------------
// RealeFlow licensed-API sourcing — pure, testable pieces.
//
// Probate, tax liens and vacancy have NO open-data source in any FL county
// (see reports/record-type-sourcing-2026-08-08.md); they come from the
// RealeFlow Partner API /search endpoint instead. This module owns the
// filter matrix, the request-body mapping, the doc_number derivation and the
// entitlement-error test so all of it can be unit tested without network.
// ---------------------------------------------------------------------------

import type { RfProperty, SearchRequest } from "../realeflow/types";

export type RealeflowLeadConfig = {
  /** Our distress_records.record_type */
  recordType: string;
  label: string;
  /** Short, stable prefix for derived doc_numbers. */
  docPrefix: string;
  /** The /search filter that produces this record type. */
  filter: Pick<SearchRequest, "leadTypes" | "lienTypes">;
  /**
   * false until RealeFlow switches the lead-type licence on for the account.
   * The puller still knows how to run it — flip this and it goes live.
   */
  enabled: boolean;
  /** Why it is off, shown in the nightly report. */
  disabledReason?: string;
};

export const REALEFLOW_LEAD_CONFIGS: readonly RealeflowLeadConfig[] = [
  {
    recordType: "probate",
    label: "Probate",
    docPrefix: "PRB",
    filter: { lienTypes: ["DECEASED_PROBATE"] },
    enabled: true,
  },
  {
    recordType: "tax_lien",
    label: "Tax Lien",
    docPrefix: "TXL",
    filter: { lienTypes: ["TAX_GOVERNMENT_LIEN"] },
    enabled: true,
  },
  {
    recordType: "vacancy",
    label: "Vacant / Zombie Property",
    docPrefix: "VAC",
    filter: { leadTypes: { include: ["ZOMBIE_PROPERTY", "VACANCY"] } },
    enabled: true,
  },
  {
    // Entitlement fixed by RealeFlow (Tyler, 2026-08-24) and verified live on
    // account 192423 (probe 2026-08-25: /search 200 with rows). Single-account
    // testing approved by RealeFlow leadership; per-user account routing is
    // required before public launch (see RfRequestOptions in client.server.ts).
    recordType: "pre_foreclosure",
    label: "Pre-Foreclosure",
    docPrefix: "PFC",
    filter: { leadTypes: { include: ["PRE_FORECLOSURE"] } },
    enabled: true,
  },
  {
    // Same entitlement fix + verification as pre_foreclosure above.
    recordType: "tax_delinquent",
    label: "Tax Delinquent",
    docPrefix: "TXD",
    filter: { leadTypes: { include: ["RECENTLY_DELINQUENT"] } },
    enabled: true,
  },
];

/** Rows requested per county per type per night. Keeps 67 × N inside limits. */
export const REALEFLOW_PAGE_SIZE = 100;
export const REALEFLOW_COUNTY_BUDGET = 200;

/**
 * Counties processed per cron tick. The sweep is sequential with a ≥1s polite
 * delay per request, so the full 67-county × 3-type matrix cannot finish inside
 * one invocation — the 2026-08-18 run died after ~13 counties and left every
 * county past "Columbia" stale. The sweep therefore walks a bounded slice per
 * tick and resumes from a persisted cursor, cycling through the whole list over
 * successive runs. Budgets and page size are untouched.
 */
export const REALEFLOW_COUNTIES_PER_TICK = 6;

export type CountySlice = {
  /** Counties this tick should process, in list order. */
  slice: string[];
  /** Where the next tick resumes (0 once the matrix has been fully covered). */
  nextCursor: number;
  /** True when this tick reached the end of the county list. */
  wrapped: boolean;
};

/**
 * Bounded, resumable slice of the ordered county list. Pure so the resume /
 * bound / wrap behaviour is unit-testable without network or database.
 */
export function sliceCounties(args: {
  counties: readonly string[];
  cursor: number;
  maxCounties?: number;
}): CountySlice {
  const total = args.counties.length;
  if (!total) return { slice: [], nextCursor: 0, wrapped: true };
  const max = Math.min(
    Math.max(Math.floor(args.maxCounties ?? REALEFLOW_COUNTIES_PER_TICK), 1),
    total,
  );
  // A cursor past the end (list shrank, or a previous wrap was not stored) simply
  // restarts the cycle rather than skipping the whole sweep.
  const start =
    Number.isFinite(args.cursor) && args.cursor > 0 ? Math.floor(args.cursor) % total : 0;
  const end = Math.min(start + max, total);
  const slice = args.counties.slice(start, end);
  const wrapped = end >= total;
  return { slice, nextCursor: wrapped ? 0 : end, wrapped };
}

/** The proven request shape: a FIPS-anchored place plus the type's filter. */
export function buildSearchBody(args: {
  fips: string;
  config: RealeflowLeadConfig;
  pageSize?: number;
  page?: number;
}): SearchRequest {
  return {
    places: [{ state: "FL", fips: Number(args.fips) }],
    page: args.page ?? 1,
    page_size: Math.min(Math.max(args.pageSize ?? REALEFLOW_PAGE_SIZE, 1), 200),
    ...args.config.filter,
  };
}

/**
 * An entitlement refusal ("not available on this account") is a licensing
 * state, not a fault: the config gets disabled with a reason and is never
 * retried until someone flips it back on.
 */
export function isEntitlementError(status: number, message: string): boolean {
  if (status !== 400 && status !== 403) return false;
  return /not available on this account|not entitled|entitlement/i.test(message);
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** "123 MAIN ST" from the API's split address parts. */
export function streetAddress(p: RfProperty): string | null {
  const parts = [str(p.address_number), str(p.address_street)].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/**
 * /search rows carry no case or lien number, so the stable per-property
 * address hash is the dedupe key, namespaced by record type. Falls back to the
 * normalized address when a row somehow arrives without a hash.
 */
export function docNumberFor(config: RealeflowLeadConfig, p: RfProperty): string | null {
  const hash = str(p.address_hash);
  if (hash) return `${config.docPrefix}-${hash}`;
  const address = streetAddress(p);
  const zip = str(p.address_zip);
  if (!address) return null;
  return `${config.docPrefix}-${address.toUpperCase().replace(/\s+/g, " ")}${zip ? `|${zip}` : ""}`;
}

/** Some records carry a mailing opt-out; we never source those. */
export function isMailingOptedOut(p: RfProperty): boolean {
  const value = (p as Record<string, unknown>)["mailing_opt_out"];
  return value === true || value === "true" || value === 1;
}

export type RealeflowFiling = {
  doc_number: string;
  filed_date: string | null;
  owner_first: string | null;
  owner_last: string | null;
  company_entity: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  amount: number | null;
  status: string | null;
  parcel_apn: string | null;
  source_url: string | null;
  raw: Record<string, unknown>;
};

/** Map a /search property onto the distress feed's filing shape. */
export function propertyToFiling(
  config: RealeflowLeadConfig,
  county: string,
  p: RfProperty,
  splitOwner: (name: string) => {
    first: string | null;
    last: string | null;
    entity: string | null;
  },
): RealeflowFiling | null {
  const doc = docNumberFor(config, p);
  if (!doc) return null;
  const owner = str(p.owner_std_name1_full) ?? "";
  const { first, last, entity } = splitOwner(owner);
  return {
    doc_number: doc,
    filed_date: null,
    owner_first: first,
    owner_last: last,
    company_entity: entity,
    property_address: streetAddress(p),
    property_city: str(p.address_city),
    property_state: str(p.address_state) ?? "FL",
    property_zip: str(p.address_zip),
    amount: typeof p.property_value === "number" ? p.property_value : null,
    status: null,
    parcel_apn: str((p as Record<string, unknown>)["parcel_number"]),
    source_url: null,
    raw: {
      source: "realeflow",
      source_class: "licensed_api",
      county,
      record_type: config.recordType,
      address_hash: str(p.address_hash),
    },
  };
}
