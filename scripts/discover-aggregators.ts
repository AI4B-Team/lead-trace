#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Surplus-funds AGGREGATOR discovery: one firm index, many counties.
//
//   bun run scripts/discover-aggregators.ts [stateOrFirmKey ...]
//
// Excess funds after a tax/foreclosure sale sit with a county officer (tax
// commissioner in GA, county/district clerk or tax office in TX, delinquent tax
// collector in SC, clerk of superior court in NC). Many counties outsource the
// records to an administrator firm, and such a firm publishes ONE index linking
// a file per county, in ONE layout — so the column meaning is confirmed once and
// reused for every county instead of writing a scraper per clerk.
//
// This is a probe: it enumerates the index, downloads each county file and
// parses it through the matching production handler (xlsx_list / pdf_list /
// html_table) to prove the confirmed layout actually yields money rows. It
// writes reports/<state>-aggregator-<firm>.json and promotes nothing — seeding
// surplus_sources is a separate, reviewed step.
//
// robots.txt is enforced per request inside politeFetch; the per-host delay and
// honest bot UA come from scraper-policy. Read-only GETs only.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { politeFetch, politeHtml, robotsAllows } from "../src/lib/data-providers/scraper-policy";
import { parseXlsxMatrix, sheetToMatrix, type XlsxListConfig } from "../src/lib/surplus/handlers/xlsx-list";
import { parsePdfLines, pdfToLines } from "../src/lib/surplus/handlers/pdf-list";
import { parseHtmlTable } from "../src/lib/surplus/handlers/html-table";
import { pickListDocuments } from "../src/lib/surplus/doc-classify";
import type { ClerkSurplusRow } from "../src/lib/surplus/handlers/types";

type PdfListConfig = Parameters<typeof parsePdfLines>[1];
type HtmlTableConfig = { columnMap: Record<string, string>; defaultClaimStatus?: ClerkSurplusRow["claim_status"] };

type Firm =
  | { key: string; name: string; state: string; index: string; saleKind: "tax_deed" | "foreclosure"; format: "xlsx"; layout: XlsxListConfig }
  | { key: string; name: string; state: string; index: string; saleKind: "tax_deed" | "foreclosure"; format: "pdf"; layout: PdfListConfig }
  | { key: string; name: string; state: string; index: string; saleKind: "tax_deed" | "foreclosure"; format: "html"; layout: HtmlTableConfig };

/**
 * The Weissman layout, confirmed by hand against real county workbooks (Fulton,
 * Lowndes, Cherokee — see report notes). "Petition Filed Date" + "Case Number"
 * mean the holder has already filed an interpleader in Superior Court, so those
 * rows are claim_filed, not unclaimed.
 */
const WEISSMAN_LAYOUT: XlsxListConfig = {
  columnMap: {
    "Matter Id": "case_number",
    "Parcel No.": "parcel_apn",
    Owner: "claimant_name",
    Address: "property_address",
    "Sale Date": "sale_date",
    "Excess Funds": "confirmed_amount",
  },
  claimFiledWhenPresent: "Petition Filed Date",
  defaultClaimStatus: "unclaimed",
};

export const FIRMS: Firm[] = [
  {
    key: "weissman",
    name: "Weissman PC (weissman.law)",
    state: "GA",
    index: "https://www.weissman.law/specialties/excess-tax-funds/",
    saleKind: "tax_deed",
    format: "xlsx",
    layout: WEISSMAN_LAYOUT,
  },
];

/**
 * Candidate indexes checked and RULED OUT, so a later sweep does not spend time
 * re-probing them. Verified 2026-08-17 — see
 * reports/aggregator-sweep-tx-sc-nc-2026-08-17.md for the evidence.
 */
export const RULED_OUT: Array<{ state: string; candidate: string; reason: string }> = [
  { state: "GA", candidate: "itsyourmoney.us", reason: "Texas accounting firm — unrelated to the GA tax commissioner portal" },
  { state: "GA", candidate: "<county>.governmentwindow.com county fronts", reason: "every county front answers our bot UA with a Cloudflare managed challenge; the portal's own public document store (images-governmentwindow S3) is used instead" },
  { state: "GA", candidate: "GovtWindow portal — Catoosa", reason: "paid-out ledger: Balance vs 'Excess Received' split across a two-line header, and every printed row already carries a payment date — which column is money still held cannot be confirmed" },
  { state: "GA", candidate: "GovtWindow portal — Polk", reason: "excess list is a block layout (one field per line), not a table; no confirmable row shape" },
  { state: "GA", candidate: "GovtWindow portal — Mitchell, Union", reason: "newest excess PDFs carry no extractable text (scanned images)" },
  { state: "GA", candidate: "GovtWindow portal — Jones, Lumpkin", reason: "excess list published only as .doc, which no handler parses" },
  { state: "GA", candidate: "GovtWindow portal — Hart, Jackson", reason: "only list on the portal is explicitly marked OLD (Hart) or dated 2009-2018 (Jackson) — stale, not the current held-funds list" },
  { state: "TX", candidate: "lgbs.com (Linebarger Goggan Blair & Sampson)", reason: "publishes sale schedules only — no held-excess-proceeds list" },
  { state: "TX", candidate: "pbfcm.com (Perdue Brandon Fielder Collins & Mott)", reason: "sale notices only; excess proceeds stay with the district clerk" },
  { state: "TX", candidate: "mvbalaw.com", reason: "sale calendars only, no money-held tables" },
  { state: "TX", candidate: "overageslist.com and similar SaaS", reason: "resale/lead-gen paywall, not a public-records holder index" },
  { state: "TX", candidate: "odysseyreport.<county>tx.gov ExcessProceedsFromTaxSale.pdf", reason: "shared Tyler Odyssey layout exists per county, but every host times out on direct TCP from our egress and returns 403 through the residential proxy — unretrievable, so nothing can be verified or promoted" },
  { state: "SC", candidate: "state association / county-directory sites", reason: "directories only; overages are held per county by the delinquent tax collector" },
  { state: "SC", candidate: "orangeburgcounty.org overage PDF", reason: "genuine machine-readable overage list, but the host answers our bot UA with a Cloudflare managed challenge" },
  { state: "NC", candidate: "Zacchaeus Legal Services, Kania Law Firm", reason: "tax-foreclosure counsel; no multi-county surplus table published" },
  { state: "NC", candidate: "per-county Clerk of Superior Court", reason: "surplus sits with each clerk under a separate special proceeding — no shared index or layout" },
];

/** Every county workbook on a firm index: link text is the county name. */
export function enumerateCountyWorkbooks(html: string, base: string): Array<{ county: string; url: string }> {
  const out = new Map<string, { county: string; url: string }>();
  const re = /<a[^>]+href="([^"]+\.xlsx?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const label = m[2]!
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || /claim|form|instruction|affidavit/i.test(label)) continue;
    let url: string;
    try {
      url = new URL(m[1]!.replace(/&amp;/g, "&"), base).toString();
    } catch {
      continue;
    }
    if (!out.has(url)) out.set(url, { county: label, url });
  }
  return [...out.values()];
}

/**
 * Every county PDF / HTML page on a firm index. Anchors are kept only when
 * doc-classify judges the target to be a LIST (never a claim form), and the
 * link label supplies the county name.
 */
export function enumerateCountyDocuments(
  html: string,
  base: string,
  ext: "pdf" | "html",
): Array<{ county: string; url: string }> {
  const anchors = new Map<string, string>(); // url -> label
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2]!
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    let url: string;
    try {
      url = new URL(m[1]!.replace(/&amp;/g, "&"), base).toString();
    } catch {
      continue;
    }
    if (ext === "pdf" && !/\.pdf(\?|$)/i.test(url)) continue;
    if (!label) continue;
    if (!anchors.has(url)) anchors.set(url, label);
  }
  const keep = ext === "pdf" ? new Set(pickListDocuments([...anchors.keys()])) : new Set(anchors.keys());
  return [...anchors.entries()]
    .filter(([url]) => keep.has(url))
    .map(([url, county]) => ({ county, url }));
}

/** Parse one county file with the handler that matches the firm's format. */
async function parseCountyFile(firm: Firm, url: string): Promise<{ rows: ClerkSurplusRow[]; countyInFile: string | null; dataRows: number }> {
  if (firm.format === "xlsx") {
    const res = await politeFetch(url, {
      headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const matrix = await sheetToMatrix(bytes, firm.layout.sheet);
    const rows = parseXlsxMatrix(matrix, firm.layout);
    // The "County" column inside the file is the firm's own label and is the
    // only trustworthy county name (index link text abbreviates some).
    const header = matrix.find((r) => r.some((x) => x.trim() === "County")) ?? [];
    const countyCol = header.findIndex((x) => x.trim() === "County");
    const inFile =
      countyCol >= 0
        ? matrix.slice(matrix.indexOf(header) + 1).find((r) => r[countyCol]?.trim())?.[countyCol]?.trim()
        : undefined;
    return { rows, countyInFile: inFile ?? null, dataRows: Math.max(matrix.length - 1, 0) };
  }
  if (firm.format === "pdf") {
    const res = await politeFetch(url, { headers: { Accept: "application/pdf" } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const lines = await pdfToLines(bytes);
    return { rows: parsePdfLines(lines, firm.layout), countyInFile: null, dataRows: lines.length };
  }
  const { html } = await politeHtml(url);
  const rows = parseHtmlTable(html, firm.layout.columnMap, firm.layout.defaultClaimStatus);
  return { rows, countyInFile: null, dataRows: rows.length };
}

async function probeFirm(firm: Firm) {
  if (!(await robotsAllows(firm.index).catch(() => false))) {
    console.log(`${firm.name}: robots.txt disallows the index — skipped`);
    return;
  }
  const { html } = await politeHtml(firm.index);
  const counties =
    firm.format === "xlsx"
      ? enumerateCountyWorkbooks(html, firm.index)
      : enumerateCountyDocuments(html, firm.index, firm.format === "pdf" ? "pdf" : "html");
  console.log(`${firm.name}: ${counties.length} county documents on the index`);
  const results: Array<Record<string, unknown>> = [];
  for (const c of counties) {
    try {
      const { rows, countyInFile, dataRows } = await parseCountyFile(firm, c.url);
      const total = rows.reduce((s, r) => s + (r.confirmed_amount ?? 0), 0);
      results.push({
        county: c.county,
        countyInFile,
        url: c.url,
        dataRows,
        moneyRows: rows.length,
        claimFiled: rows.filter((r) => r.claim_status === "claim_filed").length,
        withSaleDate: rows.filter((r) => r.sale_date).length,
        totalHeld: Number(total.toFixed(2)),
        ok: rows.length > 0,
      });
      console.log(
        `  ${c.county.slice(0, 24).padEnd(24)} ${String(rows.length).padStart(4)} rows  $${total.toFixed(2)}${countyInFile && countyInFile.toLowerCase() !== c.county.toLowerCase() ? `  (file says ${countyInFile})` : ""}`,
      );
    } catch (err) {
      results.push({ county: c.county, url: c.url, ok: false, error: String(err).slice(0, 200) });
      console.log(`  ${c.county.slice(0, 24).padEnd(24)} FAILED ${String(err).slice(0, 120)}`);
    }
  }
  const path = `reports/${firm.state.toLowerCase()}-aggregator-${firm.key}.json`;
  writeFileSync(
    path,
    JSON.stringify(
      {
        firm: firm.name,
        state: firm.state,
        index: firm.index,
        probedAt: new Date().toISOString(),
        handler: firm.format === "xlsx" ? "xlsx_list" : firm.format === "pdf" ? "pdf_list" : "html_table",
        saleKind: firm.saleKind,
        layout: firm.layout,
        counties: results,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${path}`);
}

async function main() {
  mkdirSync("reports", { recursive: true });
  const wanted = process.argv.slice(2).map((a) => a.toLowerCase());
  const firms = wanted.length
    ? FIRMS.filter((f) => wanted.includes(f.key.toLowerCase()) || wanted.includes(f.state.toLowerCase()))
    : FIRMS;
  for (const firm of firms) await probeFirm(firm);
}

if (import.meta.main) await main();
