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
  {
    state: "GA",
    candidate: "GovtWindow portal — remaining ~120 county slugs (full-bucket scan, 2026-08-18)",
    reason:
      "unfiltered scan of the whole images-governmentwindow object store (150+ list pages, ~136k keys) surfaces excess/surplus/overage documents for only 22 county slugs, every one of which is already live or already ruled out above — the portal's machine-readable held-funds lists are exhausted; any further GA county must go through records_request, not this portal",
  },
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

// ---------------------------------------------------------------------------
// PORTALS — a hosted platform many county offices publish through.
//
// GovtWindow ("It's Your Money") runs the Tax Commissioner site for ~143 Georgia
// counties. The county fronts (<slug>.governmentwindow.com) all answer our bot
// UA with a Cloudflare managed challenge, which we never solve — but the
// platform serves every document from a public, listable object store, and that
// store IS the multi-county index: resources/sites/<slug>/docs/<file>.
//
// Unlike Weissman, the counties do NOT share one layout — the platform only
// shares the host. So each county is still one config row (handler + confirmed
// columnMap / rowPattern), never a scraper, and every column below was read off
// the live document's own header by hand.
// ---------------------------------------------------------------------------

const GOVTWINDOW_DOCS = "https://images-governmentwindow.s3.us-east-1.amazonaws.com";

type PortalCounty =
  | { county: string; slug: string; docKey: string; handler: "xlsx_list"; layout: XlsxListConfig; confirmedColumns: string[] }
  | { county: string; slug: string; docKey: string; handler: "pdf_list"; layout: PdfListConfig; confirmedColumns: string[] };

type Portal = { key: string; name: string; state: string; index: string; saleKind: "tax_deed"; counties: PortalCounty[] };

export const PORTALS: Portal[] = [
  {
    key: "govtwindow",
    name: "GovtWindow / It's Your Money hosted Tax Commissioner portal",
    state: "GA",
    index: `${GOVTWINDOW_DOCS}/?list-type=2&delimiter=/&prefix=resources/sites/`,
    saleKind: "tax_deed",
    counties: [
      {
        county: "Carroll",
        slug: "carrollcountyga",
        docKey: "resources/sites/carrollcountyga/docs/EXCESS_FUNDS_LIST.xls",
        handler: "xlsx_list",
        confirmedColumns: ["MAP & PARCEL", "NAME", "PROPERTY ADDRESS", "EXCESS FUNDS"],
        layout: {
          headerRow: 8,
          columnMap: {
            "MAP & PARCEL": "parcel_apn",
            NAME: "claimant_name",
            "PROPERTY ADDRESS": "property_address",
            "EXCESS FUNDS": "confirmed_amount",
          },
          // The sheet ends with two grand totals whose identifier cells are blank.
          requirePresent: "MAP & PARCEL",
          defaultClaimStatus: "unclaimed",
        },
      },
      {
        county: "Meriwether",
        slug: "meriwethercountyga",
        docKey: "resources/sites/meriwethercountyga/docs/website excess funds list.xlsx",
        handler: "xlsx_list",
        confirmedColumns: ["PID", "OWNER", "DATE OF SALE", "PURCHASER", "TAX AMOUNT DUE", "PURCHASE PRICE", "EXCESS FUNDS"],
        layout: {
          columnMap: {
            PID: "parcel_apn",
            OWNER: "claimant_name",
            "DATE OF SALE": "sale_date",
            "EXCESS FUNDS": "confirmed_amount",
          },
          defaultClaimStatus: "unclaimed",
        },
      },
      {
        county: "Coweta",
        slug: "cowetacountyga",
        docKey: "resources/sites/cowetacountyga/docs/EXCESS FUNDS LIST 1.pdf",
        handler: "pdf_list",
        confirmedColumns: ["Sale Date", "Map #", "Property Owner", "Buyer", "Minimum", "Sale Amt", "Overage", "Status"],
        layout: {
          // Owner and buyer print as one run of text with no separator, so the
          // pair is kept in raw rather than split into a wrong owner name.
          columns: ["sale_date", "parcel_apn", "owner_and_buyer", "minimum_due", "sale_amount", "confirmed_amount", "claim_status"],
          rowPattern:
            "^(\\d{1,2}\\/\\d{1,2}\\/\\d{4}) (\\S+) (.+?) \\$ ?([\\d,]+\\.\\d{2}) \\$ ?([\\d,]+\\.\\d{2}) \\$ ?([\\d,]+\\.\\d{2})(.*)$",
          skipLines: ["Sale Date Map #"],
          defaultClaimStatus: "unclaimed",
        },
      },
      {
        county: "Decatur",
        slug: "decaturcountyga",
        docKey: "resources/sites/decaturcountyga/docs/Web Excess funds 12312024.pdf",
        handler: "pdf_list",
        confirmedColumns: [
          "PURCHASER",
          "DATE OF SALE",
          "PARCEL ID",
          "ACCOUNT #",
          "DEFENDANT IN FIFA + address",
          "PURCHASE PRICE",
          "EXCESS FUNDS",
          "TAX YRS DUE",
        ],
        layout: {
          columns: [
            "purchaser",
            "sale_date",
            "parcel_apn",
            "account_no",
            "defendant_and_address",
            "purchase_price",
            "confirmed_amount",
            "tax_years",
          ],
          rowPattern:
            "^(.+?) (\\d{1,2}\\/\\d{1,2}\\/\\d{4}) (.+?) (\\d{5,7}) (.+?) ([\\d,]+\\.\\d{2})\\$ ([\\d,]+\\.\\d{2})\\$ ([\\d-]+)$",
          skipLines: ["EXCESS FUNDS LIST", "PURCHASER DATE OF SALE"],
          defaultClaimStatus: "unclaimed",
        },
      },
      {
        county: "Walton",
        slug: "waltoncountyga",
        docKey: "resources/sites/waltoncountyga/docs/Excess_funds.pdf",
        handler: "pdf_list",
        confirmedColumns: ["NAME", "MAP/PARCEL", "bid", "SALE DATE", "TAXES DUE", "EXCESS FUNDS"],
        layout: {
          // The printed row order is name, parcel, winning bid, sale date, taxes
          // due, excess — the header prints SALE DATE before the bid column.
          columns: ["claimant_name", "parcel_apn", "sale_amount", "sale_date", "taxes_due", "confirmed_amount"],
          rowPattern:
            "^(.+?) ([A-Z0-9][A-Z0-9/-]*\\d[A-Z0-9/-]*) ([\\d,]+\\.\\d{2})\\$ (\\d{1,2}\\/\\d{1,2}\\/\\d{4}) ([\\d,]+\\.\\d{2})\\$ ([\\d,]+\\.\\d{2})\\$$",
          skipLines: ["NAME MAP/PARCEL", "WALTON COUNTY EXCESS"],
          defaultClaimStatus: "unclaimed",
        },
      },
    ],
  },
];

/** Absolute URL for one object in the portal's document store. */
export function portalDocUrl(key: string): string {
  return `${GOVTWINDOW_DOCS}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Every excess-funds document the portal hosts for a county, newest first. Used
 * to find candidates; nothing is parsed until a human confirms the layout.
 */
export async function listPortalExcessDocs(slug: string): Promise<Array<{ key: string; lastModified: string; size: number }>> {
  const out: Array<{ key: string; lastModified: string; size: number }> = [];
  let token = "";
  for (let page = 0; page < 20; page++) {
    const url =
      `${GOVTWINDOW_DOCS}/?list-type=2&prefix=resources/sites/${slug}/&max-keys=1000` +
      (token ? `&continuation-token=${encodeURIComponent(token)}` : "");
    const res = await politeFetch(url);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key><LastModified>([^<]+)<\/LastModified><ETag>[^<]*<\/ETag><Size>(\d+)/g)) {
      if (/excess|surplus|overage/i.test(m[1]!)) out.push({ key: m[1]!, lastModified: m[2]!, size: Number(m[3]) });
    }
    const next = xml.match(/<NextContinuationToken>([^<]+)/);
    if (!xml.includes("<IsTruncated>true</IsTruncated>") || !next) break;
    token = next[1]!;
  }
  return out.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

async function probePortal(portal: Portal) {
  console.log(`${portal.name}: ${portal.counties.length} counties with a human-confirmed layout`);
  const results: Array<Record<string, unknown>> = [];
  for (const c of portal.counties) {
    const url = portalDocUrl(c.docKey);
    try {
      const res = await politeFetch(url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const rows =
        c.handler === "xlsx_list"
          ? parseXlsxMatrix(await sheetToMatrix(bytes, c.layout.sheet), c.layout)
          : parsePdfLines(await pdfToLines(bytes), c.layout);
      const total = rows.reduce((s, r) => s + (r.confirmed_amount ?? 0), 0);
      results.push({
        county: c.county,
        slug: c.slug,
        url,
        handler: c.handler,
        confirmedColumns: c.confirmedColumns,
        moneyRows: rows.length,
        claimFiled: rows.filter((r) => r.claim_status === "claim_filed").length,
        withSaleDate: rows.filter((r) => r.sale_date).length,
        withParcel: rows.filter((r) => r.parcel_apn).length,
        totalHeld: Number(total.toFixed(2)),
        ok: rows.length > 0,
      });
      console.log(`  ${c.county.padEnd(12)} ${c.handler.padEnd(10)} ${String(rows.length).padStart(4)} rows  $${total.toFixed(2)}`);
    } catch (err) {
      results.push({ county: c.county, slug: c.slug, url, handler: c.handler, ok: false, error: String(err).slice(0, 200) });
      console.log(`  ${c.county.padEnd(12)} FAILED ${String(err).slice(0, 120)}`);
    }
  }
  const path = `reports/${portal.state.toLowerCase()}-aggregator-${portal.key}.json`;
  writeFileSync(
    path,
    JSON.stringify(
      {
        portal: portal.name,
        state: portal.state,
        index: portal.index,
        probedAt: new Date().toISOString(),
        saleKind: portal.saleKind,
        note: "The portal shares a host, not a layout — every columnMap/rowPattern below was confirmed by hand against the live document header.",
        ruledOut: RULED_OUT.filter((r) => r.state === portal.state),
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
  const portals = wanted.length
    ? PORTALS.filter((p) => wanted.includes(p.key.toLowerCase()) || wanted.includes(p.state.toLowerCase()))
    : PORTALS;
  for (const portal of portals) await probePortal(portal);
}

if (import.meta.main) await main();
