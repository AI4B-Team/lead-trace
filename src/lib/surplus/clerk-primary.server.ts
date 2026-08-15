/**
 * Clerk-primary surplus ingest (server-only).
 *
 * WHY THIS EXISTS — and how it differs from the phase-1 derived path:
 *
 * The boss's phase-1 design (deriveAndIngestSurplus in distress-feed.server.ts)
 * computes surplus from RealAuction sale results: surplus = sold amount − amount
 * owed. That path is `estimated: true`, and the whole phase-2 confirmation layer
 * (surplus_confirmations, surplus_records_visible) overlays on top of those
 * derived rows.
 *
 * We verified two things that make that path unavailable to us for many counties:
 *   1. RealAuction pages render their auction items with JavaScript. Our fetch
 *      path (relay runner) only reads raw HTML, so it never sees `soldAmount` —
 *      no sold amount means no derived record at all.
 *   2. RealAuction robots.txt disallows automation, so we do not solve the JS
 *      wall with a headless browser.
 *
 * The county clerk's OWN published surplus list is the reliable alternative. It
 * carries the CONFIRMED surplus dollar figure directly (no derivation, no
 * estimate) — see reports/surplus-funds-sourcing-2026-08-13.md. Marion's PDF was
 * validated end-to-end (645 rows, 0 unmatched) against the real unpdf handler.
 *
 * This module therefore writes clerk rows straight into distress_records as
 * `surplus_funds`, exactly the shape deriveAndIngestSurplus produces, but with
 * `estimated: false` and the clerk's amount. Every existing view, preview RPC
 * and UI keeps working unchanged — they already read surplus_funds rows out of
 * distress_records; this just adds primary (clerk-confirmed) rows for counties
 * RealAuction cannot serve.
 *
 * Invariants kept identical to the derived path:
 *   - A row with no positive amount produces NOTHING (never zero, never a guess).
 *   - doc_number is stable so a nightly re-pull is idempotent via the
 *     (fips, record_type, doc_number) unique constraint.
 *   - Only `status = 'live'` sources ingest. 'unverified' sources are parsed for
 *     reporting only and write nothing customer-facing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { countyKey } from "../distress-feed.shared";
import { ingestDistressRecords, type RawFiling } from "../distress-feed.server";
import { SURPLUS_HANDLERS, type ClerkSurplusRow, type SurplusSourceRow } from "./handlers";

type DB = SupabaseClient<Database>;

/**
 * Handlers that read the clerk's OWN published surplus list, and therefore may
 * write confirmed (not estimated) surplus_funds rows.
 */
export const CLERK_PRIMARY_HANDLERS = ["pdf_list", "html_table", "xlsx_list"] as const;

export type ClerkIngestResult = {
  sourceId: string;
  county: string;
  state: string;
  handler: string;
  saleKind: string;
  /** Rows the handler parsed from the clerk list. */
  parsed: number;
  /** Rows that carried a usable positive amount (candidates to write). */
  withAmount: number;
  /** Rows actually written to distress_records. */
  written: number;
  status: string;
  bytes: number;
  skipped?: string;
  reason?: string;
  error?: string;
};

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

/**
 * tax_deed sales measure surplus over the opening bid; foreclosure sales over
 * the final judgment. We keep the same basis label the derived path uses so the
 * public view's `sale_type` mapping (opening_bid → tax_deed) stays correct.
 */
function basisForSaleKind(saleKind: string): "opening_bid" | "final_judgment" {
  return saleKind === "tax_deed" ? "opening_bid" : "final_judgment";
}

/** Turn one clerk-published row into the feed's filing shape. */
export function clerkRowToFiling(
  row: ClerkSurplusRow,
  ctx: { fips: string; state: string; county: string; saleKind: string; sourceUrl: string | null },
): RawFiling | null {
  // No confirmed amount → not a usable surplus record. Same discipline as the
  // derived path: unknown is a gap, never a zero.
  if (row.confirmed_amount == null || !(row.confirmed_amount > 0)) return null;

  // Stable, unique per clerk record. Prefer the clerk's own case/sale number,
  // then the parcel, then a date+address fallback so a row without a case number
  // still dedupes deterministically.
  const key =
    row.case_number?.trim() ||
    row.parcel_apn?.trim() ||
    `${row.sale_date ?? "nodate"}|${(row.property_address ?? "").toUpperCase()}`;
  const docNumber = `SURP-${ctx.fips}-${key}`;

  // Some clerks (e.g. DeKalb GA) DO print the name the funds are held for next
  // to the amount, plus a zip in the situs line. Use it when present; never
  // invent one when the list is owner-less (Marion FL).
  const printedName = (row.claimant_name ?? "").trim();
  const isEntity = /\b(LLC|L\.L\.C|INC|CORP|CO|COMPANY|TRUST|LP|LLP|PARTNERS|BANK|ESTATE|HOLDINGS|PROPERTIES|INVESTMENTS|ENTERPRISES|PLAN)\b/i.test(
    printedName,
  );
  const nameParts = printedName ? printedName.split(/\s+/) : [];
  const rawZip = typeof row.raw?.["zip"] === "string" ? (row.raw["zip"] as string) : "";
  const zip = /^\d{5}$/.test(rawZip.trim()) ? rawZip.trim() : null;

  return {
    doc_number: docNumber,
    filed_date: row.sale_date ?? null,
    owner_first: !printedName || isEntity || nameParts.length < 2 ? null : nameParts[0]!,
    owner_last: !printedName || isEntity ? null : nameParts[nameParts.length - 1]!,
    // Owner-less clerk lists stay null here; enrichment (parcel → owner) fills
    // them later, which is a gap to close, not a value to guess.
    company_entity: printedName && isEntity ? printedName : null,
    property_address: row.property_address ?? null,
    property_city: null,
    property_state: ctx.state.toUpperCase(),
    property_zip: zip,
    amount: row.confirmed_amount,
    auction_date: row.sale_date ?? null,
    status: row.claim_status ?? "unclaimed",
    parcel_apn: row.parcel_apn ?? null,
    source_url: ctx.sourceUrl,
    surplus_amount: row.confirmed_amount,
    surplus_basis: basisForSaleKind(ctx.saleKind),
    sold_to: null,
    // The whole point: clerk-confirmed, NOT estimated.
    estimated: false,
    raw: {
      ...row.raw,
      clerk_confirmed: true,
      source: "clerk_surplus_list",
      claim_status: row.claim_status,
    },
  };
}

/**
 * Pick the newest surplus PDF link off a clerk's stable landing page.
 *
 * Clerks keep the LANDING page URL constant (e.g. the "Unclaimed Funds" page)
 * but rotate the PDF filename, which usually embeds the run date
 * (…Surplus-Funds-2026-08-07.pdf). We collect every .pdf href, keep those whose
 * URL matches `linkMatch` (a case-insensitive substring/regex, default
 * "surplus"), and choose the one with the latest embedded YYYY-MM-DD — falling
 * back to lexical max when no date is present. Returns an absolute URL, or null
 * if nothing matched (caller then keeps the stored source_url).
 */
export function pickLatestPdf(
  html: string,
  landingUrl: string,
  linkMatch = "surplus",
): string | null {
  const base = new URL(landingUrl);
  const matcher = new RegExp(linkMatch, "i");
  const candidates: Array<{ url: string; dateKey: string }> = [];

  for (const m of html.matchAll(/href\s*=\s*["']([^"']+\.pdf)["']/gi)) {
    const raw = m[1];
    if (!raw) continue;
    let abs: string;
    try {
      abs = new URL(raw, base).toString();
    } catch {
      continue;
    }
    if (!matcher.test(abs)) continue;
    // Prefer an embedded ISO date; else 2026-08-07 style anywhere in the URL.
    const iso = abs.match(/(\d{4})[-_/](\d{2})[-_/](\d{2})/);
    const dateKey = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : "0000-00-00";
    candidates.push({ url: abs, dateKey });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    a.dateKey === b.dateKey ? a.url.localeCompare(b.url) : a.dateKey.localeCompare(b.dateKey),
  );
  return candidates[candidates.length - 1]!.url;
}

/** Fetch the clerk landing page and return the newest matching surplus PDF URL. */
export async function resolveLatestPdfUrl(
  landingUrl: string,
  linkMatch = "surplus",
): Promise<string | null> {
  const { politeHtml } = await import("../data-providers/scraper-policy");
  const { html } = await politeHtml(landingUrl);
  return pickLatestPdf(html, landingUrl, linkMatch);
}

/**
 * Run one clerk surplus source end to end and write confirmed rows into
 * distress_records. Errors are captured, not thrown, so one broken clerk page
 * never aborts a sweep of the others.
 */
export async function ingestClerkSurplusSource(
  source: SurplusSourceRow,
  opts: { dryRun?: boolean } = {},
): Promise<ClerkIngestResult> {
  const db = await admin();
  const fips = countyKey(source.state, source.county_name);
  const base: ClerkIngestResult = {
    sourceId: source.id,
    county: source.county_name,
    state: source.state,
    handler: source.handler,
    saleKind: source.sale_kind,
    parsed: 0,
    withAmount: 0,
    written: 0,
    status: source.status,
    bytes: 0,
  };

  // Only PRIMARY clerk handlers belong here (the clerk's own published list:
  // PDF, HTML table, or spreadsheet). realauction_tab / open_data /
  // records_request are handled by the existing phase-2 pipeline.
  if (!CLERK_PRIMARY_HANDLERS.includes(source.handler)) {
    return { ...base, skipped: `handler '${source.handler}' is not a clerk-primary handler` };
  }

  const handler = SURPLUS_HANDLERS[source.handler];
  if (!handler) return { ...base, skipped: `No handler named ${source.handler}` };

  // Clerks publish surplus PDFs under a DATED filename that rotates (e.g.
  // ...Surplus-Funds-2026-08-07.pdf). Fetching a fixed URL would 404 the moment
  // the county republishes. When fetch_config.resolveLatestFrom is set, follow
  // the clerk's STABLE landing page and pick the newest matching PDF instead, so
  // a monthly refresh needs no config change. Failure to resolve falls back to
  // the stored source_url rather than aborting.
  let effectiveSource = source;
  const cfg = source.fetch_config as { resolveLatestFrom?: string; linkMatch?: string } | null;
  if (source.handler === "pdf_list" && cfg?.resolveLatestFrom) {
    try {
      const latest = await resolveLatestPdfUrl(cfg.resolveLatestFrom, cfg.linkMatch);
      if (latest) effectiveSource = { ...source, source_url: latest };
    } catch {
      // Landing page unreachable — fall through to the stored source_url.
    }
  }

  let result: Awaited<ReturnType<typeof handler>>;
  try {
    result = await handler({ source: effectiveSource });
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }

  base.parsed = result.rows.length;
  base.bytes = result.bytes;
  base.reason = result.reason;

  const filings: RawFiling[] = [];
  for (const row of result.rows) {
    const filing = clerkRowToFiling(row, {
      fips,
      state: source.state,
      county: source.county_name,
      saleKind: source.sale_kind,
      sourceUrl: source.source_url,
    });
    if (filing) filings.push(filing);
  }
  base.withAmount = filings.length;

  if (opts.dryRun) return base;

  // Only a promoted source writes customer-facing rows. 'unverified' is parsed
  // for reporting but writes nothing — the same gate the boss uses in phase 2.
  if (source.status !== "live") {
    await db
      .from("surplus_sources")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", source.id);
    return {
      ...base,
      skipped: `Source is '${source.status}' — parsed ${result.rows.length}, wrote none`,
    };
  }

  if (!filings.length) {
    await db
      .from("surplus_sources")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", source.id);
    return { ...base, reason: result.reason ?? "No rows carried a usable amount" };
  }

  try {
    base.written = await ingestDistressRecords(
      db,
      { state: source.state, county: source.county_name, recordType: "surplus_funds" },
      filings,
    );
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }

  await db
    .from("surplus_sources")
    .update({
      last_checked_at: new Date().toISOString(),
      last_success_at: result.fetchedAt,
      consecutive_failures: 0,
    })
    .eq("id", source.id);

  const { count: coveredRows } = await db
    .from("distress_records")
    .select("id", { count: "exact", head: true })
    .eq("record_type", "surplus_funds")
    .eq("fips", fips);

  // Keep the coverage registry's freshness in step with the clerk pull, so
  // "last updated" on the feed and county pages reflects tonight's list.
  // Coverage rows are keyed by state + county name (the fips column is not
  // consistently the same key style as distress_records), so match on those.
  await db
    .from("source_coverage")
    .update({
      last_success_at: result.fetchedAt,
      status: "verified",
      ...(typeof coveredRows === "number" ? { sample_row_count: coveredRows } : {}),
    })
    .eq("state", source.state)
    .ilike("county_name", source.county_name)
    .eq("record_type", "surplus_funds");

  return base;
}

/**
 * Sweep every clerk-primary source (pdf_list / html_table / xlsx_list). Called from the
 * nightly tick BEFORE the phase-2 confirmation sweep, so a clerk row is present
 * in distress_records for any later reconciliation to match against.
 */
export async function sweepClerkSurplusSources(
  opts: { includeUnverified?: boolean } = {},
): Promise<{ results: ClerkIngestResult[] }> {
  const db = await admin();
  const statuses = opts.includeUnverified ? ["live", "unverified", "broken"] : ["live", "broken"];
  const { data } = await db
    .from("surplus_sources")
    .select("*")
    .in("status", statuses)
    .in("handler", CLERK_PRIMARY_HANDLERS as unknown as string[]);
  const sources = (data ?? []) as unknown as SurplusSourceRow[];
  const results: ClerkIngestResult[] = [];
  for (const source of sources) {
    results.push(await ingestClerkSurplusSource(source));
  }
  return { results };
}
