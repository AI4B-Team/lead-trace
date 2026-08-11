// ---------------------------------------------------------------------------
// County public-records scraper provider. Real, verified open-data sources
// (plain JSON APIs — no headless browser needed) that return code-violation
// style records mapped into the RawLead shape. Follows the same provider
// pattern as apify.ts / dnc.ts so the pipeline orchestrator stays clean.
//
// Verified live 2026-07-29:
//   - Cook (Chicago), IL  → Socrata 22u3-xenr  (building violations)
//   - Philadelphia, PA    → Carto SQL `violations` (L&I violations, OPA owner)
//   - New York City, NY   → Socrata wvxf-dwi5  (HPD housing violations)
//
// Verified live 2026-08-01 (real tax-default datasets, not relabeled
// violations — dispatched per record type, violations as fallback):
//   - Philadelphia, PA    → Carto `real_estate_tax_delinquencies` (owner + $ due)
//   - New York City, NY   → Socrata 9rz4-mjek (tax/water lien sale list)
// ---------------------------------------------------------------------------

import type { RawLead } from "./index";
import { recordTypeId } from "@/lib/record-types";

const UA = "LeadTrace-Scraper/1.0";
/** Cap per run: keeps jobs fast and predictable on credits. */
const MAX_RECORDS_PER_RUN = 25;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) throw new Error(`County Source Returned HTTP ${res.status}`);
  return res.json();
}

function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Sanitize a YYYY-MM-DD date for safe interpolation into SoQL/SQL. */
function safeDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^\d{4}-\d{2}-\d{2}/.exec(v.trim());
  return m ? m[0] : null;
}

export type CountyRecordParams = {
  county: string;
  recordType: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  /** Pagination offset — used to hand each record type its own distinct slice. */
  offset?: number;
};

// ── Cook County (Chicago), IL — building/code violations ──────────────────

async function scrapeCookIl(p: CountyRecordParams): Promise<RawLead[]> {
  const where = ["violation_status = 'OPEN'", "address IS NOT NULL"];
  const from = safeDate(p.dateFrom);
  const to = safeDate(p.dateTo);
  if (from) where.push(`violation_date >= '${from}T00:00:00'`);
  if (to) where.push(`violation_date <= '${to}T23:59:59'`);
  const params = new URLSearchParams({
    $limit: String(p.limit ?? MAX_RECORDS_PER_RUN),
    $offset: String(p.offset ?? 0),
    $order: "violation_date DESC",
    $where: where.join(" AND "),
  });
  const rows = (await fetchJson(
    `https://data.cityofchicago.org/resource/22u3-xenr.json?${params}`,
  )) as Array<Record<string, unknown>>;
  return rows
    .filter((r) => str(r.address).length > 4)
    .map((r) => ({
      full_name: null,
      address: str(r.address),
      city: "Chicago",
      state: "IL",
      source_meta: {
        record_type: p.recordType,
        county: "Cook, IL",
        case_id: `CHI-${str(r.id)}`,
        case_date: isoDate(r.violation_date),
        gov_status: str(r.violation_status) || null,
        violation: [str(r.violation_description), str(r.violation_inspector_comments)]
          .filter(Boolean)
          .join(" — ")
          .slice(0, 500) || null,
        provider: "City Of Chicago Open Data (Socrata)",
      },
    }));
}

// ── Philadelphia, PA — L&I code violations (includes OPA owner name!) ─────

async function scrapePhiladelphiaPa(p: CountyRecordParams): Promise<RawLead[]> {
  const limit = p.limit ?? MAX_RECORDS_PER_RUN;
  const conds = ["violationstatus = 'OPEN'", "address IS NOT NULL"];
  const from = safeDate(p.dateFrom);
  const to = safeDate(p.dateTo);
  if (from) conds.push(`violationdate >= '${from}'`);
  if (to) conds.push(`violationdate <= '${to} 23:59:59'`);
  const sql =
    "SELECT casenumber, address, zip, violationdate, violationcodetitle, violationstatus, opa_owner " +
    `FROM violations WHERE ${conds.join(" AND ")} ` +
    `ORDER BY violationdate DESC NULLS LAST LIMIT ${limit} OFFSET ${p.offset ?? 0}`;
  const json = (await fetchJson(
    `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(sql)}`,
  )) as { rows?: Array<Record<string, unknown>> };
  const seen = new Set<string>();
  const out: RawLead[] = [];
  for (const r of json.rows ?? []) {
    const caseNum = str(r.casenumber);
    if (!caseNum || seen.has(caseNum) || str(r.address).length < 5) continue;
    seen.add(caseNum);
    out.push({
      full_name: str(r.opa_owner) || null,
      address: str(r.address),
      city: "Philadelphia",
      state: "PA",
      zip: str(r.zip).slice(0, 5) || null,
      source_meta: {
        record_type: p.recordType,
        county: "Philadelphia, PA",
        case_id: `PHL-${caseNum}`,
        case_date: isoDate(r.violationdate),
        gov_status: str(r.violationstatus) || null,
        violation: str(r.violationcodetitle).slice(0, 500) || null,
        provider: "Philadelphia L&I Open Data (Carto)",
      },
    });
  }
  return out;
}

// ── New York City, NY — HPD housing violations ────────────────────────────

async function scrapeNycNy(p: CountyRecordParams): Promise<RawLead[]> {
  const where = [
    "violationstatus = 'Open'",
    "housenumber IS NOT NULL",
    "streetname IS NOT NULL",
  ];
  const from = safeDate(p.dateFrom);
  const to = safeDate(p.dateTo);
  if (from) where.push(`inspectiondate >= '${from}T00:00:00'`);
  if (to) where.push(`inspectiondate <= '${to}T23:59:59'`);
  const params = new URLSearchParams({
    $limit: String(p.limit ?? MAX_RECORDS_PER_RUN),
    $offset: String(p.offset ?? 0),
    $order: "inspectiondate DESC",
    $where: where.join(" AND "),
  });
  const rows = (await fetchJson(
    `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?${params}`,
  )) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const boro = str(r.boro);
    const boroTitle = boro ? boro.charAt(0) + boro.slice(1).toLowerCase() : "New York";
    return {
      full_name: null,
      address: `${str(r.housenumber)} ${str(r.streetname)}`,
      city: boroTitle,
      state: "NY",
      zip: str(r.zip).slice(0, 5) || null,
      source_meta: {
        record_type: p.recordType,
        county: "New York City, NY",
        case_id: `NYC-${str(r.violationid)}`,
        case_date: isoDate(r.inspectiondate),
        gov_status: str(r.currentstatus) || null,
        violation: `Class ${str(r.class) || "?"} — ${str(r.novdescription)}`.slice(0, 500),
        provider: "NYC HPD Open Data (Socrata)",
      },
    };
  });
}

// ── Philadelphia, PA — real estate TAX delinquencies (owner + amount due) ─

async function scrapePhiladelphiaPaTax(p: CountyRecordParams): Promise<RawLead[]> {
  const limit = p.limit ?? MAX_RECORDS_PER_RUN;
  // Yearly snapshot dataset — no per-record filing date, so the date-range
  // filter doesn't apply here; ranked by amount owed (most distressed first).
  const sql =
    "SELECT street_address, zip_code, owner, total_due, num_years_owed, most_recent_year_owed " +
    "FROM real_estate_tax_delinquencies WHERE street_address IS NOT NULL AND total_due > 0 " +
    `ORDER BY total_due DESC LIMIT ${limit} OFFSET ${p.offset ?? 0}`;
  const json = (await fetchJson(
    `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(sql)}`,
  )) as { rows?: Array<Record<string, unknown>> };
  return (json.rows ?? [])
    .filter((r) => str(r.street_address).length >= 5)
    .map((r) => ({
      full_name: str(r.owner) || null,
      address: str(r.street_address),
      city: "Philadelphia",
      state: "PA",
      zip: str(r.zip_code).slice(0, 5) || null,
      source_meta: {
        record_type: p.recordType,
        county: "Philadelphia, PA",
        case_id: `PHL-TAX-${str(r.street_address).replace(/\s+/g, "-").slice(0, 40)}`,
        case_date: r.most_recent_year_owed ? `${str(r.most_recent_year_owed)}-01-01` : null,
        gov_status: "DELINQUENT",
        violation:
          `Tax Delinquent — $${Number(r.total_due ?? 0).toLocaleString()} due, ` +
          `${str(r.num_years_owed) || "?"} year(s) owed`,
        provider: "Philadelphia Revenue Dept Open Data (Carto)",
      },
    }));
}

// ── New York City, NY — tax/water lien sale list ───────────────────────────

async function scrapeNycNyTax(p: CountyRecordParams): Promise<RawLead[]> {
  const where = ["house_number IS NOT NULL", "street_name IS NOT NULL"];
  const from = safeDate(p.dateFrom);
  const to = safeDate(p.dateTo);
  if (from) where.push(`month >= '${from}T00:00:00'`);
  if (to) where.push(`month <= '${to}T23:59:59'`);
  const params = new URLSearchParams({
    $limit: String(p.limit ?? MAX_RECORDS_PER_RUN),
    $offset: String(p.offset ?? 0),
    $order: "month DESC",
    $where: where.join(" AND "),
  });
  const rows = (await fetchJson(
    `https://data.cityofnewyork.us/resource/9rz4-mjek.json?${params}`,
  )) as Array<Record<string, unknown>>;
  const BORO: Record<string, string> = {
    "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
  };
  return rows.map((r) => ({
    full_name: null,
    address: `${str(r.house_number)} ${str(r.street_name)}`,
    city: BORO[str(r.borough)] ?? "New York",
    state: "NY",
    zip: str(r.zip_code).slice(0, 5) || null,
    source_meta: {
      record_type: p.recordType,
      county: "New York City, NY",
      case_id: `NYC-LIEN-${str(r.borough)}-${str(r.block)}-${str(r.lot)}`,
      case_date: isoDate(r.month),
      gov_status: str(r.cycle) || "LIEN SALE",
      violation:
        `Tax/Water Lien Sale — ${str(r.cycle) || "listed"}` +
        (str(r.water_debt_only) === "YES" ? " (water debt only)" : ""),
      provider: "NYC Dept of Finance Open Data (Socrata)",
    },
  }));
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

type CountyScraper = (p: CountyRecordParams) => Promise<RawLead[]>;

/** Per-county default scraper (code violations — broadest dataset). */
const LIVE_COUNTY_SCRAPERS: Record<string, CountyScraper> = {
  "Cook, IL": scrapeCookIl,
  "Philadelphia, PA": scrapePhiladelphiaPa,
  "New York City, NY": scrapeNycNy,
};

/** Record-type-specific datasets ("County::record_type_slug" → scraper). Keys
 * join on the record type SLUG, never a display name. Types without a
 * dedicated dataset fall back to the county default above. */
const RECORD_TYPE_SCRAPERS: Record<string, CountyScraper> = {
  "Philadelphia, PA::tax_default": scrapePhiladelphiaPaTax,
  "New York City, NY::tax_default": scrapeNycNyTax,
};

/** Counties with real live scrapers behind them. */
export function liveCountyKeys(): string[] {
  return Object.keys(LIVE_COUNTY_SCRAPERS);
}

export function hasLiveCountyScraper(county: string): boolean {
  return county in LIVE_COUNTY_SCRAPERS;
}

export async function scrapeCountyRecords(p: CountyRecordParams): Promise<RawLead[]> {
  const slug = recordTypeId(p.recordType) ?? p.recordType;
  const impl = RECORD_TYPE_SCRAPERS[`${p.county}::${slug}`] ?? LIVE_COUNTY_SCRAPERS[p.county];
  if (!impl) throw new Error(`No Live Scraper For County "${p.county}"`);
  return impl({ ...p, limit: Math.min(Math.max(p.limit ?? MAX_RECORDS_PER_RUN, 1), 100) });
}
