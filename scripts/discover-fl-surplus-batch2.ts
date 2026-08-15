#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Batch 2 of Florida clerk-primary surplus discovery.
//
//   bun run scripts/discover-fl-surplus-batch2.ts
//
// Probe only. Reports which clerk publishes a machine-readable list of held
// tax deed surplus, which handler fits, and what the columns actually say.
// Nothing is promoted here: a guessed dollar column is a wrong figure shown to
// a customer, so a human confirms the mapping before any row goes live.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { robotsAllows, politeHtml } from "../src/lib/data-providers/scraper-policy";
import { extractRows, extractTables, stripTags } from "../src/lib/surplus/handlers/html-table";

const CANDIDATES: Array<{ county: string; urls: string[] }> = [
  { county: "Duval", urls: ["https://www.duvalclerk.com/departments/tax-deeds", "https://www.duvalclerk.com/departments/tax-deeds/tax-deed-surplus"] },
  { county: "Orange", urls: ["https://myorangeclerk.com/Divisions/Tax-Deeds", "https://myorangeclerk.com/Divisions/Tax-Deeds/Surplus-Funds"] },
  { county: "Lee", urls: ["https://www.leeclerk.org/departments/tax-deeds/surplus-funds", "https://www.leeclerk.org/departments/tax-deeds"] },
  { county: "Lake", urls: ["https://www.lakecountyclerk.org/official-records/tax-deeds/", "https://www.lakecountyclerk.org/services/tax_deeds/surplus_funds.aspx"] },
  { county: "Seminole", urls: ["https://www.seminoleclerk.org/Departments/TaxDeeds/", "https://seminole.realtaxdeed.com/"] },
  { county: "Alachua", urls: ["https://alachuaclerk.org/tax-deeds/", "https://alachuaclerk.org/tax-deed-surplus/"] },
  { county: "Escambia", urls: ["https://www.escambiaclerk.com/163/Tax-Deeds", "https://www.escambiaclerk.com/482/Tax-Deed-Surplus"] },
  { county: "Leon", urls: ["https://cvweb.leonclerk.com/public/online_services/tax_deeds/", "https://www.leonclerk.com/tax-deeds/"] },
  { county: "St. Lucie", urls: ["https://stlucieclerk.com/tax-deed-sales", "https://stlucieclerk.com/surplus-funds"] },
  { county: "Charlotte", urls: ["https://www.charlotteclerk.com/departments/official-records/tax-deed-sales", "https://www.charlotteclerk.com/tax-deed-surplus"] },
  { county: "Collier", urls: ["https://www.collierclerk.com/tax-deeds/", "https://www.collierclerk.com/records/tax-deeds/surplus/"] },
  { county: "Clay", urls: ["https://www.clayclerk.com/tax-deeds/", "https://www.clayclerk.com/tax-deed-surplus/"] },
  { county: "Bay", urls: ["https://www.baycoclerk.com/tax-deeds/", "https://www.baycoclerk.com/tax-deed-surplus-funds/"] },
  { county: "Okaloosa", urls: ["https://www.okaloosaclerk.com/tax-deeds/", "https://www.clerkofcourts.cc/tax-deeds/"] },
  { county: "Highlands", urls: ["https://www.hcclerk.org/official-records/tax-deeds", "https://www.hcclerk.org/tax-deed-surplus"] },
  { county: "Putnam", urls: ["https://www.putnam-fl.com/coc/tax-deeds/", "https://putnam.realtaxdeed.com/"] },
  { county: "Indian River", urls: ["https://www.clerk.indian-river.org/tax-deed-sales", "https://www.clerk.indian-river.org/surplus-funds"] },
  { county: "Nassau", urls: ["https://www.nassauclerk.com/tax-deeds/", "https://www.nassauclerk.com/tax-deed-surplus/"] },
];

const FIELD_HINTS: Array<[RegExp, string]> = [
  [/case|file\s*(no|number)|tax\s*deed\s*(no|number)|tdf/i, "case_number"],
  [/parcel|folio|apn|property\s*id|alt\s*key/i, "parcel_apn"],
  [/address|situs|location|legal/i, "property_address"],
  [/surplus|overbid|excess|amount\s*due|balance|funds\s*available/i, "confirmed_amount"],
  [/sale\s*date|auction\s*date|date\s*of\s*sale/i, "sale_date"],
  [/deadline|expires|claim\s*by|escheat/i, "claim_deadline"],
  [/status|claimed|disburse/i, "claim_status"],
  [/owner|claimant|applicant|name/i, "claimant_name"],
];

function suggest(headers: string[]) {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const hit = FIELD_HINTS.find(([re]) => re.test(h));
    if (hit && !Object.values(map).includes(hit[1])) map[h] = hit[1];
  }
  return map;
}

function pdfLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+\.(?:pdf|xlsx|xls|csv)[^"']*)["']/gi)) {
    try { out.add(new URL(m[1]!, base).toString()); } catch { /* unparsable */ }
  }
  return [...out].slice(0, 12);
}

type Probe = Record<string, unknown>;

async function probe(county: string, url: string): Promise<Probe> {
  const base = { county, url, ok: false, robotsAllowed: false, handler: "unknown", tables: 0, headers: [] as string[], suggested: {}, docLinks: [] as string[], note: "" };
  const allowed = await robotsAllows(url).catch(() => false);
  base.robotsAllowed = Boolean(allowed);
  if (!allowed) return { ...base, note: "robots.txt disallows — not collectable" };

  let html = "";
  try {
    html = (await politeHtml(url)).html;
  } catch (err) {
    return { ...base, note: err instanceof Error ? err.message : String(err) };
  }

  base.tables = extractTables(html).length;
  base.docLinks = pdfLinks(html, url);

  let best: { headers: string[]; map: Record<string, string> } | null = null;
  for (const t of extractTables(html)) {
    const rows = extractRows(t);
    if (rows.length < 2) continue;
    const headers = (rows[0] ?? []).map((h) => stripTags(h)).filter(Boolean);
    const map = suggest(headers);
    if (!best || Object.keys(map).length > Object.keys(best.map).length) best = { headers, map };
  }
  const surplusDoc = (base.docLinks as string[]).filter((u) => /surplus|overbid|excess|unclaimed|tax.?deed/i.test(u));

  if (best && Object.keys(best.map).length >= 2 && /surplus|overbid|excess|unclaimed/i.test(html)) {
    return { ...base, ok: true, handler: "html_table", headers: best.headers, suggested: best.map, note: "Candidate table. Confirm every column before promoting." };
  }
  if (surplusDoc.length) {
    return { ...base, ok: true, handler: /\.xlsx?|\.csv/i.test(surplusDoc[0]!) ? "xlsx_list" : "pdf_list", docLinks: surplusDoc, note: `${surplusDoc.length} candidate document(s). Needs a rowPattern from the real file.` };
  }
  return { ...base, note: /surplus|overbid|unclaimed/i.test(html) ? "Page mentions surplus but publishes no list (claim instructions only)" : "Page reachable, no surplus list detected" };
}

async function main() {
  const probes: Probe[] = [];
  for (const c of CANDIDATES) {
    for (const url of c.urls) {
      const p = await probe(c.county, url);
      probes.push(p);
      console.log(`${p.ok ? "OK  " : "MISS"} ${String(c.county).padEnd(12)} ${String(p.handler).padEnd(11)} ${url}\n     ${p.note}`);
      if (Object.keys(p.suggested as object).length) console.log(`     suggested: ${JSON.stringify(p.suggested)}`);
      if ((p.docLinks as string[]).length && p.ok) console.log(`     docs: ${(p.docLinks as string[]).slice(0, 3).join(" | ")}`);
      if (p.ok) break;
    }
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/fl-surplus-batch2.json", JSON.stringify({ generatedAt: new Date().toISOString(), probes }, null, 2));
  console.log(`\n${probes.filter((p) => p.ok).length} candidate(s). Report: reports/fl-surplus-batch2.json`);
}

void main();
