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
