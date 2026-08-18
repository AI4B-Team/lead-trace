#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Florida priority-6 surplus discovery — the FOUR gap counties.
//
//   bun run scripts/discover-fl-priority6.ts
//
// Hillsborough (xlsx_list) and Osceola (pdf_list) are already live and are NOT
// touched here. This probes the remaining Tampa Bay / Central FL targets:
//
//   Orange   — the Comptroller (occompt.com), not the Clerk, is the tax-deed
//              custodian; also the robots-allowed orange.realtaxdeed.com.
//   Polk     — polkcountyclerk.net + polk.realtaxdeed.com (the 2026-08-15 pass
//              reached the tax-deed page but found no held-surplus list).
//   Pinellas — mypinellasclerk.gov, previously parked on records_request.
//   Pasco    — pascoclerk.com, same.
//
// Probe only. Nothing is written to the DB and nothing is promoted: a guessed
// dollar column is a wrong figure shown to a customer, so a human confirms the
// mapping against the live header first. robots.txt is enforced per request
// inside politeFetch/politeHtml; a 403 or managed challenge is recorded as a
// records_request county, never worked around.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { robotsAllows, politeHtml } from "../src/lib/data-providers/scraper-policy";
import { links, type Hit } from "./discover-fl-clerk-links";
import { probe } from "./discover-fl-surplus-batch3";

type County = {
  county: string;
  /** Entry points, preference order. Real surplus pages are DISCOVERED from these. */
  roots: string[];
  /** Pages worth probing directly in addition to whatever discovery finds. */
  direct?: string[];
};

const COUNTIES: County[] = [
  {
    county: "Orange",
    roots: [
      "https://www.occompt.com/",
      "https://www.occompt.com/sitemap.xml",
      "https://myorangeclerk.com/",
      "https://orange.realtaxdeed.com/",
    ],
    direct: ["https://www.occompt.com/official-records/tax-deeds/", "https://orange.realtaxdeed.com/index.cfm?zaction=USER&zmethod=CALENDAR"],
  },
  {
    county: "Polk",
    roots: [
      "https://www.polkcountyclerk.net/",
      "https://www.polkcountyclerk.net/sitemap.xml",
      "https://polk.realtaxdeed.com/",
    ],
    direct: ["https://www.polkcountyclerk.net/336/Tax-Deeds", "https://www.polkcountyclerk.net/347/Unclaimed-Funds"],
  },
  {
    county: "Pinellas",
    roots: ["https://mypinellasclerk.gov/", "https://mypinellasclerk.gov/sitemap.xml", "https://www.mypinellasclerk.org/"],
    direct: ["https://mypinellasclerk.gov/Home/TaxDeeds", "https://mypinellasclerk.gov/Home/UnclaimedFunds"],
  },
  {
    county: "Pasco",
    roots: ["https://www.pascoclerk.com/", "https://www.pascoclerk.com/sitemap.xml", "https://pascoclerk.com/"],
    direct: ["https://www.pascoclerk.com/263/Tax-Deed-Sales", "https://www.pascoclerk.com/280/Unclaimed-Funds"],
  },
];

/** Discover the county's real tax-deed / surplus pages from its own entry points. */
async function discover(roots: string[]): Promise<{ hits: Hit[]; notes: string[] }> {
  const notes: string[] = [];
  const found = new Map<string, Hit>();
  for (const root of roots) {
    if (!(await robotsAllows(root).catch(() => false))) {
      notes.push(`robots.txt disallows ${root}`);
      continue;
    }
    try {
      const { html } = await politeHtml(root);
      const hits = links(html, root);
      for (const h of hits) if (!found.has(h.href)) found.set(h.href, h);
      notes.push(`${root}: ${hits.length} relevant link(s)`);
    } catch (err) {
      notes.push(`${root}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { hits: [...found.values()], notes };
}

async function main() {
  const out: Array<Record<string, unknown>> = [];

  for (const c of COUNTIES) {
    const { hits, notes } = await discover(c.roots);
    // Probe discovered pages first (they are real links), then the direct guesses.
    const targets = [...hits.map((h) => h.href), ...(c.direct ?? [])].slice(0, 8);

    const probes: Array<Record<string, unknown>> = [];
    let winner: Record<string, unknown> | null = null;
    for (const url of targets) {
      const p = await probe(c.county, url);
      probes.push(p);
      console.log(`${p.ok ? "OK  " : "MISS"} ${c.county.padEnd(10)} ${String(p.handler).padEnd(11)} ${url}\n     ${p.note}`);
      if (p.ok && !winner) {
        winner = p;
        break;
      }
    }

    out.push({ county: c.county, discoveryNotes: notes, links: hits, probes, candidate: winner });
    if (!winner) console.log(`---- ${c.county}: no machine-readable list found in ${targets.length} page(s)`);
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/fl-priority-6-2026-08-19.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), counties: out }, null, 2),
  );
  console.log(`\n${out.filter((c) => c.candidate).length} of ${out.length} gap counties produced a candidate list.`);
}

if (import.meta.main) void main();
