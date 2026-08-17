/**
 * Five handlers, not 67 scrapers.
 *
 * Florida clerks publish surplus lists as HTML tables, monthly PDFs, a tab on
 * the RealAuction site, occasionally open data, and sometimes only by public
 * records request. Which one applies is a per-county config row, and every
 * selector lives in that row's fetch_config so a markup change is a data fix
 * rather than a deploy.
 */

export type SurplusHandlerName =
  | "html_table"
  | "pdf_list"
  | "xlsx_list"
  | "realauction_tab"
  | "open_data"
  | "records_request";

export type SurplusSourceRow = {
  id: string;
  county_name: string;
  state: string;
  sale_kind: "foreclosure" | "tax_deed";
  handler: SurplusHandlerName;
  source_url: string | null;
  fetch_config: Record<string, unknown>;
  refresh_cadence: "daily" | "weekly" | "biweekly" | "monthly";
  last_checked_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  status: "live" | "unverified" | "broken" | "manual";
  notes: string | null;
};

/** One row as the clerk published it. Nothing here is inferred. */
export type ClerkSurplusRow = {
  case_number: string | null;
  parcel_apn: string | null;
  property_address: string | null;
  confirmed_amount: number | null;
  sale_date: string | null;
  /** Only set when the clerk prints a deadline; it always beats a computed one. */
  claim_deadline: string | null;
  claim_status: "unclaimed" | "claim_filed" | "disbursed" | "escheated" | "unknown";
  claimant_name: string | null;
  raw: Record<string, unknown>;
};

export type HandlerResult = {
  rows: ClerkSurplusRow[];
  /** Fetch timestamp — becomes confirmed_as_of on every row it produced. */
  fetchedAt: string;
  bytes: number;
  /** Populated when a handler legitimately produced nothing. Never fabricate. */
  reason?: string;
  /** True when the source is handled out-of-band (records request). */
  deferred?: boolean;
};

export type HandlerContext = {
  source: SurplusSourceRow;
  /** Bounds a single run; handlers stop early rather than hammer a clerk box. */
  maxPages?: number;
};

export function emptyResult(reason: string, bytes = 0): HandlerResult {
  return { rows: [], fetchedAt: new Date().toISOString(), bytes, reason };
}

/** Money as printed by clerks: "$12,345.67", "12345.67", "(1,234.00)". */
export function parseMoney(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const cleaned = String(v).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Dates as printed by clerks: M/D/YYYY, MM-DD-YYYY, YYYY-MM-DD. */
export function parseClerkDate(v: string | null | undefined): string | null {
  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const s = (v ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return plausible(`${iso[1]}-${iso[2]}-${iso[3]}`);
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    const year = us[3]!.length === 2 ? `20${us[3]}` : us[3]!;
    return plausible(`${year.padStart(4, "0")}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`);
  }
  // "November 1, 2016" / "Nov. 1 2016" — several tax commissioners spell the
  // sale date out. A month with no day (e.g. "Aug. 2024") is deliberately not
  // accepted: we do not invent a day the clerk never published.
  const named = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[1]!.slice(0, 3).toLowerCase()];
    if (month) return plausible(`${named[3]}-${month}-${named[2]!.padStart(2, "0")}`);
  }
  return null;
}

/**
 * Clerk lists carry typed sale dates, and a typo'd year is worse than a blank:
 * "09/02/0025" (Newton GA, meant 2025) would sort a live 2025 surplus to the
 * year 25 AD and break every freshness and deadline calculation downstream. A
 * date outside a sane window is dropped, not guessed.
 */
function plausible(iso: string): string | null {
  const year = Number(iso.slice(0, 4));
  return year >= 1980 && year <= new Date().getUTCFullYear() + 2 ? iso : null;
}

/**
 * Boilerplate several Georgia lists append to every defendant name, and the
 * catch-all wording used when the county names no defendant at all. The first
 * is noise around a real name; the second is not a name and must not be shown
 * as one.
 */
const NAME_BOILERPLATE = /\s*and\/or\s+(his|her|their)(\s+or\s+(his|her|their))?\s+known\s+or\s+unknown\s+heirs(\s+at\s+law)?\.?\s*$/i;
const NOT_A_NAME = /^(any\s+and\s+all\s+parties|unknown\s+(owner|heirs)|owner\s+unknown|n\/?a)\b/i;

export function cleanClaimantName(raw: string | null): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || NOT_A_NAME.test(s)) return null;
  const cleaned = s.replace(NAME_BOILERPLATE, "").replace(/[,;]\s*$/, "").trim();
  return cleaned || null;
}

/**
 * Addresses in these lists are assembled from parts, so a row with no street on
 * file still prints its state ("GA", ", GA"). That is not an address.
 */
export function cleanAddress(raw: string | null): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "").trim();
  if (!s) return null;
  return /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/i.test(s) ? null : s;
}

const CLAIM_STATUS_WORDS: Array<[RegExp, ClerkSurplusRow["claim_status"]]> = [
  [/escheat/i, "escheated"],
  [/disburs|paid|released|distributed/i, "disbursed"],
  // "Interpleader filed 11/21/24" (Coweta GA): the tax commissioner has already
  // handed the money to Superior Court, so a claim is on file.
  [/claim\s*(filed|submitted|pending)|pending\s*claim|interplead/i, "claim_filed"],
  [/unclaimed|available|held|outstanding/i, "unclaimed"],
];

/** Only maps words the clerk actually printed; anything else is 'unknown'. */
export function parseClaimStatus(v: string | null | undefined): ClerkSurplusRow["claim_status"] {
  const s = (v ?? "").trim();
  if (!s) return "unknown";
  for (const [re, status] of CLAIM_STATUS_WORDS) if (re.test(s)) return status;
  return "unknown";
}

/**
 * Map a parsed record of column-name → cell text onto a ClerkSurplusRow using
 * the source's configured column map. Unmapped columns are kept in `raw` so a
 * later config fix can recover them without a re-fetch.
 */
export function toClerkRow(
  cells: Record<string, string>,
  columnMap: Record<string, string>,
): ClerkSurplusRow | null {
  const get = (field: string): string | null => {
    for (const [column, mapped] of Object.entries(columnMap)) {
      if (mapped !== field) continue;
      const hit = Object.entries(cells).find(([k]) => k.toLowerCase().trim() === column.toLowerCase().trim());
      if (hit && hit[1].trim()) return hit[1].trim();
    }
    return null;
  };

  const amount = parseMoney(get("confirmed_amount"));
  const caseNumber = get("case_number");
  const apn = get("parcel_apn");
  // A row with neither an identifier nor an amount cannot be reconciled or
  // shown, so it is dropped rather than stored as a half-record.
  if (!amount && !caseNumber && !apn) return null;

  return {
    case_number: caseNumber,
    parcel_apn: apn,
    property_address: cleanAddress(get("property_address")),
    confirmed_amount: amount,
    sale_date: parseClerkDate(get("sale_date")),
    claim_deadline: parseClerkDate(get("claim_deadline")),
    claim_status: parseClaimStatus(get("claim_status")),
    claimant_name: cleanClaimantName(get("claimant_name")),
    raw: cells,
  };
}
