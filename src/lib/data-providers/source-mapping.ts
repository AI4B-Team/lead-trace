// ---------------------------------------------------------------------------
// Canonical field mapping shared by every discovered source (Socrata, ArcGIS,
// bulk file). Discovery infers the map from a dataset's column names; a human
// can correct it later and the corrected map is what runs from then on.
// ---------------------------------------------------------------------------

import type { RawLead } from "./index";

export type FieldMap = {
  address?: string;
  house_number?: string;
  street_name?: string;
  city?: string;
  state?: string;
  zip?: string;
  owner?: string;
  case_id?: string;
  case_date?: string;
  status?: string;
  description?: string;
  amount?: string;
};

/**
 * Canonical record types we search and store against — SLUGS, matching
 * public.record_types.slug exactly. Display names live in one place
 * (record_types, with recordTypeDisplayName() as the accessor); this list used
 * to carry its own display strings, which drifted in word order from the table
 * and made every join silently miss.
 */
export const DISCOVERY_RECORD_TYPES = [
  "code_violation",
  "vacancy",
  "tax_default",
  "pre_foreclosure",
  "probate",
  "eviction",
  "surplus_funds",
] as const;

export type DiscoveryRecordType = (typeof DISCOVERY_RECORD_TYPES)[number];

/** Keyword sets used to search open-data catalogs, keyed by record type slug. */
export const DISCOVERY_KEYWORDS: Record<DiscoveryRecordType, string[]> = {
  code_violation: ["code violation", "code enforcement", "building violation"],
  vacancy: ["demolition", "demolition order", "unsafe structure", "vacant property", "vacancy"],
  tax_default: ["tax delinquent", "tax delinquency", "tax lien"],
  pre_foreclosure: ["lis pendens", "foreclosure", "notice of default"],
  probate: ["probate", "estate filing"],
  eviction: ["eviction", "notice to vacate", "unlawful detainer"],
  surplus_funds: [
    "surplus funds",
    "excess proceeds",
    "unclaimed surplus",
    "surplus list",
    "excess funds",
  ],
};

const CANDIDATES: Array<[keyof FieldMap, string[]]> = [
  ["address", ["address", "full_address", "street_address", "property_address", "location_address", "site_address", "addr"]],
  ["house_number", ["house_number", "housenumber", "house_no", "streetnumber", "street_number"]],
  ["street_name", ["street_name", "streetname", "street"]],
  ["city", ["city", "municipality", "town", "boro", "borough"]],
  ["state", ["state", "state_code", "st"]],
  ["zip", ["zip", "zipcode", "zip_code", "postal_code", "postalcode"]],
  ["owner", ["owner", "owner_name", "ownername", "opa_owner", "taxpayer", "respondent", "defendant", "decedent"]],
  ["case_id", ["case_number", "casenumber", "case_id", "caseid", "violation_number", "violationid", "record_id", "objectid", "id"]],
  ["case_date", ["violation_date", "violationdate", "case_date", "filing_date", "inspection_date", "inspectiondate", "issue_date", "date", "created_date", "recorded_date"]],
  ["status", ["status", "violation_status", "violationstatus", "case_status", "current_status", "disposition"]],
  ["description", ["description", "violation_description", "violationcodetitle", "code_description", "comments", "narrative", "type", "nov_description"]],
  ["amount", ["total_due", "amount_due", "balance", "amount", "assessed_amount"]],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Best-effort field map from a dataset's raw column names. */
export function inferFieldMap(columns: string[]): FieldMap {
  const byNorm = new Map(columns.map((c) => [norm(c), c]));
  const map: FieldMap = {};
  for (const [key, options] of CANDIDATES) {
    for (const opt of options) {
      const hit = byNorm.get(opt);
      if (hit) {
        map[key] = hit;
        break;
      }
    }
    if (!map[key]) {
      // Fall back to a contains-match so odd local naming still lands.
      const loose = columns.find((c) => options.some((o) => norm(c).includes(o)));
      if (loose) map[key] = loose;
    }
  }
  return map;
}

/** A source is only usable if we can build a street address out of it. */
export function isUsableMap(map: FieldMap): boolean {
  return Boolean(map.address || (map.house_number && map.street_name));
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  // ArcGIS returns dates as epoch milliseconds; Socrata returns ISO strings.
  if (/^-?\d{10,14}$/.test(s)) {
    const ms = Number(s);
    const epoch = new Date(ms);
    return isNaN(epoch.getTime()) ? null : epoch.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export type NormalizeContext = {
  recordType: string;
  county: string;
  state?: string | null;
  provider: string;
  casePrefix?: string;
  defaultCity?: string | null;
};

/** Map arbitrary dataset rows into the pipeline's RawLead shape. */
export function normalizeRows(
  rows: Array<Record<string, unknown>>,
  map: FieldMap,
  ctx: NormalizeContext,
): RawLead[] {
  const out: RawLead[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const address = map.address
      ? str(r[map.address])
      : `${str(map.house_number ? r[map.house_number] : "")} ${str(map.street_name ? r[map.street_name] : "")}`.trim();
    if (address.length < 5) continue;
    const caseId = map.case_id ? str(r[map.case_id]) : "";
    const dedupe = `${caseId}|${address}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const city = (map.city ? str(r[map.city]) : "") || str(ctx.defaultCity) || ctx.county.split(",")[0]!.trim();
    out.push({
      full_name: (map.owner ? str(r[map.owner]) : "") || null,
      address,
      city: city || null,
      state: (map.state ? str(r[map.state]) : "") || ctx.state || null,
      zip: (map.zip ? str(r[map.zip]).slice(0, 5) : "") || null,
      source_meta: {
        record_type: ctx.recordType,
        county: ctx.county,
        case_id: caseId ? `${ctx.casePrefix ?? "REC"}-${caseId}` : null,
        case_date: map.case_date ? isoDate(r[map.case_date]) : null,
        gov_status: (map.status ? str(r[map.status]) : "") || null,
        violation:
          [map.description ? str(r[map.description]) : "", map.amount ? `Amount Due: $${str(r[map.amount])}` : ""]
            .filter(Boolean)
            .join(" — ")
            .slice(0, 500) || null,
        provider: ctx.provider,
      },
    });
  }
  return out;
}
