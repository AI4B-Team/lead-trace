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
  const s = (v ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    const year = us[3]!.length === 2 ? `20${us[3]}` : us[3]!;
    return `${year}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }
  return null;
}

const CLAIM_STATUS_WORDS: Array<[RegExp, ClerkSurplusRow["claim_status"]]> = [
  [/escheat/i, "escheated"],
  [/disburs|paid|released|distributed/i, "disbursed"],
  [/claim\s*(filed|submitted|pending)|pending\s*claim/i, "claim_filed"],
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
    property_address: get("property_address"),
    confirmed_amount: amount,
    sale_date: parseClerkDate(get("sale_date")),
    claim_deadline: parseClerkDate(get("claim_deadline")),
    claim_status: parseClaimStatus(get("claim_status")),
    claimant_name: get("claimant_name"),
    raw: cells,
  };
}
