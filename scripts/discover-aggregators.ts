#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Surplus-funds AGGREGATOR discovery: one firm index, many counties.
//
//   bun run scripts/discover-ga-aggregators.ts
//
// Georgia tax-sale excess funds sit with the Tax Commissioner, and many
// counties outsource the records to an administrator firm. Such a firm publishes
// ONE index linking a workbook per county, in ONE layout — so the column
// meaning is confirmed once and reused for every county instead of writing a
// scraper per clerk.
//
// This is a probe: it enumerates the index, downloads each county workbook and
// parses it through the existing xlsx_list handler to prove the confirmed
// layout actually yields money rows. It writes reports/ga-aggregator-<firm>.json
// and promotes nothing — seeding surplus_sources is a separate, reviewed step.
//
// robots.txt is enforced per request inside politeFetch; the per-host delay and
// honest bot UA come from scraper-policy. Read-only GETs only.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { politeFetch, politeHtml, robotsAllows } from "../src/lib/data-providers/scraper-policy";
import { parseXlsxMatrix, sheetToMatrix, type XlsxListConfig } from "../src/lib/surplus/handlers/xlsx-list";

type Firm = { key: string; name: string; state: string; index: string; layout: XlsxListConfig };

/**
 * The firm layout, confirmed by hand against real county workbooks (Fulton,
 * Lowndes, Cherokee — see report notes). "Petition Filed Date" + "Case Number"
 * mean the holder has already filed an interpleader in Superior Court, so those rows are
 * claim_filed, not unclaimed.
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

const FIRMS: Firm[] = [
  {
    key: "weissman",
    name: "Weissman PC (weissman.law)",
    state: "GA",
    index: "https://www.weissman.law/specialties/excess-tax-funds/",
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

async function main() {
  mkdirSync("reports", { recursive: true });
  for (const firm of FIRMS) {
    if (!(await robotsAllows(firm.index).catch(() => false))) {
      console.log(`${firm.name}: robots.txt disallows the index — skipped`);
      continue;
    }
    const { html } = await politeHtml(firm.index);
    const counties = enumerateCountyWorkbooks(html, firm.index);
    console.log(`${firm.name}: ${counties.length} county workbooks on the index`);
    const results: Array<Record<string, unknown>> = [];
    for (const c of counties) {
      try {
        const res = await politeFetch(c.url, {
          headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        });
        const bytes = new Uint8Array(await res.arrayBuffer());
        const matrix = await sheetToMatrix(bytes);
        const rows = parseXlsxMatrix(matrix, firm.layout);
        const total = rows.reduce((s, r) => s + (r.confirmed_amount ?? 0), 0);
        // The "County" column inside the file is the firm's own label and is the
        // only trustworthy county name (index link text abbreviates some).
        const header = matrix.find((r) => r.some((x) => x.trim() === "County")) ?? [];
        const countyCol = header.findIndex((x) => x.trim() === "County");
        const inFile =
          countyCol >= 0 ? matrix.slice(matrix.indexOf(header) + 1).find((r) => r[countyCol]?.trim())?.[countyCol]?.trim() : undefined;
        results.push({
          county: c.county,
          countyInFile: inFile ?? null,
          url: c.url,
          dataRows: Math.max(matrix.length - 1, 0),
          moneyRows: rows.length,
          claimFiled: rows.filter((r) => r.claim_status === "claim_filed").length,
          withSaleDate: rows.filter((r) => r.sale_date).length,
          totalHeld: Number(total.toFixed(2)),
          ok: rows.length > 0,
        });
        console.log(
          `  ${c.county.padEnd(16)} ${String(rows.length).padStart(4)} rows  $${total.toFixed(2)}${inFile && inFile.toLowerCase() !== c.county.toLowerCase() ? `  (file says ${inFile})` : ""}`,
        );
      } catch (err) {
        results.push({ county: c.county, url: c.url, ok: false, error: String(err).slice(0, 200) });
        console.log(`  ${c.county.padEnd(16)} FAILED ${String(err).slice(0, 120)}`);
      }
    }
    const path = `reports/ga-aggregator-${firm.key}.json`;
    writeFileSync(
      path,
      JSON.stringify(
        {
          firm: firm.name,
          state: firm.state,
          index: firm.index,
          probedAt: new Date().toISOString(),
          handler: "xlsx_list",
          layout: firm.layout,
          counties: results,
        },
        null,
        2,
      ),
    );
    console.log(`wrote ${path}`);
  }
}

if (import.meta.main) await main();
