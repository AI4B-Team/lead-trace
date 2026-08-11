#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Surplus source discovery for the four Florida proof counties.
//
//   bun run scripts/discover-surplus-sources.ts           # probe + report
//   bun run scripts/discover-surplus-sources.ts --write   # persist candidates
//
// What this does NOT do: promote anything to 'live'. It probes candidate clerk
// URLs, reports which handler fits and what the table headers actually say, and
// writes that back as fetch_config on an 'unverified' row. A human reads the
// report, confirms the column meanings, and flips status to 'live'. Guessing a
// dollar column is how a wrong surplus figure reaches a customer.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from "node:fs";
import { robotsAllows } from "../src/lib/data-providers/scraper-policy";
import { extractRows, extractTables, stripTags } from "../src/lib/surplus/handlers/html-table";

const WRITE = process.argv.includes("--write");
const OUT_DIR = "reports";

/** Candidate pages per proof county. Order is preference order. */
const CANDIDATES: Array<{ county: string; state: string; urls: string[] }> = [
  {
    county: "Hillsborough",
    state: "FL",
    urls: [
      "https://hillsclerk.com/Additional-Services/Tax-Deeds",
      "https://hillsborough.realtaxdeed.com/index.cfm?zaction=USER&zmethod=CALENDAR",
    ],
  },
  {
    county: "Pasco",
    state: "FL",
    urls: [
      "https://www.pascoclerk.com/523/Tax-Deed-Surplus",
      "https://pasco.realtaxdeed.com/index.cfm?zaction=USER&zmethod=CALENDAR",
    ],
  },
  {
    county: "Pinellas",
    state: "FL",
    urls: [
      "https://www.mypinellasclerk.gov/Home/Tax-Deed-Sales",
      "https://pinellas.realtaxdeed.com/index.cfm?zaction=USER&zmethod=CALENDAR",
    ],
  },
  {
    county: "Polk",
    state: "FL",
    urls: [
      "https://www.polkcountyclerk.net/262/Tax-Deed-Surplus",
      "https://polk.realtaxdeed.com/index.cfm?zaction=USER&zmethod=CALENDAR",
    ],
  },
];

/** Header words that suggest a column carries a given field. Reported, not applied. */
const FIELD_HINTS: Array<[RegExp, string]> = [
  [/case|file\s*(no|number)|tax\s*deed\s*(no|number)/i, "case_number"],
  [/parcel|folio|apn|property\s*id/i, "parcel_apn"],
  [/address|situs|location/i, "property_address"],
  [/surplus|overbid|excess|amount\s*due|balance/i, "confirmed_amount"],
  [/sale\s*date|auction\s*date|date\s*of\s*sale/i, "sale_date"],
  [/deadline|expires|claim\s*by|escheat/i, "claim_deadline"],
  [/status|claimed|disburse/i, "claim_status"],
  [/claimant|applicant/i, "claimant_name"],
];

type Probe = {
  county: string;
  state: string;
  url: string;
  ok: boolean;
  httpStatus: number | null;
  robotsAllowed: boolean;
  handler: "html_table" | "pdf_list" | "unknown";
  tables: number;
  headers: string[];
  suggestedColumnMap: Record<string, string>;
  pdfLinks: string[];
  note: string;
};

function suggestColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const hit = FIELD_HINTS.find(([re]) => re.test(h));
    if (hit) map[h] = hit[1];
  }
  return map;
}

function pdfLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const re = /href\s*=\s*["']([^"']+\.pdf[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.add(new URL(m[1]!, base).toString());
    } catch {
      /* skip unparsable href */
    }
  }
  return [...out].slice(0, 10);
}

async function probe(county: string, state: string, url: string): Promise<Probe> {
  const base: Probe = {
    county,
    state,
    url,
    ok: false,
    httpStatus: null,
    robotsAllowed: false,
    handler: "unknown",
    tables: 0,
    headers: [],
    suggestedColumnMap: {},
    pdfLinks: [],
    note: "",
  };

  const allowed = await robotsAllows(url).catch(() => false);
  base.robotsAllowed = Boolean(allowed);
  if (!allowed) return { ...base, note: "Blocked by robots.txt — do not scrape" };

  let html = "";
  try {
    const { politeHtml } = await import("../src/lib/data-providers/scraper-policy");
    const res = await politeHtml(url);
    html = res.html;
    base.httpStatus = 200;
  } catch (err) {
    return { ...base, note: err instanceof Error ? err.message : String(err) };
  }

  const tables = extractTables(html);
  base.tables = tables.length;
  base.pdfLinks = pdfLinks(html, url);

  let best: { headers: string[]; map: Record<string, string> } | null = null;
  for (const t of tables) {
    const rows = extractRows(t);
    if (rows.length < 2) continue;
    const headers = (rows[0] ?? []).map((h) => stripTags(h)).filter(Boolean);
    const map = suggestColumnMap(headers);
    if (!best || Object.keys(map).length > Object.keys(best.map).length) best = { headers, map };
  }

  if (best && Object.keys(best.map).length >= 2) {
    return {
      ...base,
      ok: true,
      handler: "html_table",
      headers: best.headers,
      suggestedColumnMap: best.map,
      note: "Candidate table found. Confirm every column meaning before promoting to live.",
    };
  }
  if (base.pdfLinks.length) {
    return {
      ...base,
      ok: true,
      handler: "pdf_list",
      headers: best?.headers ?? [],
      note: `No usable table; ${base.pdfLinks.length} PDF link(s) found. Needs a rowPattern from a real PDF.`,
    };
  }
  return { ...base, note: "Page reachable but no surplus table or PDF list detected" };
}

async function main(): Promise<void> {
  const probes: Probe[] = [];
  for (const c of CANDIDATES) {
    for (const url of c.urls) {
      const p = await probe(c.county, c.state, url);
      probes.push(p);
      console.log(
        `${p.ok ? "OK  " : "MISS"} ${c.county} ${p.handler.padEnd(10)} ${url}\n     ${p.note}` +
          (Object.keys(p.suggestedColumnMap).length
            ? `\n     suggested: ${JSON.stringify(p.suggestedColumnMap)}`
            : ""),
      );
      if (p.ok) break; // first usable candidate per county wins
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/surplus-source-discovery.json`;
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), probes }, null, 2));
  console.log(`\nReport: ${path}`);

  if (!WRITE) {
    console.log("Dry run. Re-run with --write to store candidate configs (still 'unverified').");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  );
  for (const p of probes.filter((x) => x.ok)) {
    const { error } = await supabase
      .from("surplus_sources")
      .update({
        handler: p.handler,
        source_url: p.url,
        fetch_config: p.handler === "html_table" ? { columnMap: p.suggestedColumnMap } : { pdfLinks: p.pdfLinks },
        status: "unverified",
        notes: `Discovery ${new Date().toISOString().slice(0, 10)}: ${p.note}`,
      })
      .eq("state", p.state)
      .ilike("county_name", p.county);
    if (error) console.error(`write failed ${p.county}: ${error.message}`);
  }
  console.log("Candidate configs stored. Every row stays 'unverified' until a human confirms columns.");
}

void main();
