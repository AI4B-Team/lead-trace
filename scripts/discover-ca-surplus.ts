#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// California excess-proceeds discovery (probe only).
//
//   bun run scripts/discover-ca-surplus.ts
//
// California county Treasurer-Tax Collectors hold excess proceeds from Chapter 7
// tax-defaulted land sales and must publish the parties of interest and the
// amount available (Cal. Rev. & Tax. Code 4674/4675). Most large counties post
// that as a PDF or spreadsheet next to the claim form.
//
// Method reuses the Florida building blocks exactly — no new scraping logic:
//   1. `links()` from discover-fl-clerk-links.ts finds the REAL excess-proceeds
//      page from each tax collector's homepage / sitemap (never a guessed URL).
//   2. `probe()` from discover-fl-surplus-batch3.ts decides whether the page
//      publishes a machine-readable LIST (doc-classify rejects claim forms and
//      instructions) and suggests a column map for a human to confirm.
//
// Probe only: nothing is written to the database and nothing is promoted. A
// guessed dollar column is a wrong figure shown to a customer, so every column
// meaning comes from the live file's own header, confirmed by a human, before a
// surplus_sources row goes to 'live'.
// robots.txt is enforced per request inside politeFetch and is never overridden;
// a host that survives the residential proxy but still challenges us becomes a
// records_request candidate, never a bypass.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { robotsAllows, politeHtml } from "../src/lib/data-providers/scraper-policy";
import { links, type Hit } from "./discover-fl-clerk-links";
import { probe } from "./discover-fl-surplus-batch3";

/** Highest-population counties first: most rows, biggest dollars. Roots only. */
const COUNTIES: Array<{ county: string; roots: string[] }> = [
  { county: "Los Angeles", roots: ["https://ttc.lacounty.gov/", "https://ttc.lacounty.gov/sitemap.xml"] },
  { county: "San Diego", roots: ["https://www.sdttc.com/", "https://www.sdttc.com/sitemap.xml"] },
  { county: "Orange", roots: ["https://octreasurer.gov/", "https://octreasurer.gov/sitemap.xml"] },
  { county: "Riverside", roots: ["https://www.countytreasurer.org/", "https://countytreasurer.org/"] },
  { county: "San Bernardino", roots: ["https://mytaxcollector.com/", "https://www.sbcounty.gov/"] },
  { county: "Santa Clara", roots: ["https://tax.santaclaracounty.gov/", "https://tax.sccgov.org/"] },
  { county: "Alameda", roots: ["https://www.acgov.org/treasurer/", "https://www.acgov.org/"] },
  { county: "Sacramento", roots: ["https://finance.saccounty.gov/Tax/", "https://finance.saccounty.gov/"] },
  { county: "Kern", roots: ["https://www.kcttc.co.kern.ca.us/", "https://kerncounty.com/"] },
  { county: "Fresno", roots: ["https://www.fresnocountyca.gov/Departments/Auditor-Controller-Treasurer-Tax-Collector", "https://www.fresnocountyca.gov/"] },
  { county: "Contra Costa", roots: ["https://www.contracosta.ca.gov/191/Treasurer-Tax-Collector", "https://www.contracosta.ca.gov/"] },
  { county: "Ventura", roots: ["https://www.venturapropertytax.org/", "https://www.ventura.org/"] },
  { county: "San Joaquin", roots: ["https://www.sjgov.org/department/ttcnew/", "https://www.sjgov.org/"] },
  { county: "Stanislaus", roots: ["https://www.stancounty.com/treasurer/", "https://www.stancounty.com/"] },
  { county: "Sonoma", roots: ["https://sonomacounty.ca.gov/ACTTC/", "https://sonomacounty.ca.gov/"] },
  { county: "Tulare", roots: ["https://tularecounty.ca.gov/treasurertaxcollector/", "https://tularecounty.ca.gov/"] },
];

async function findExcessPages(roots: string[]): Promise<{ hits: Hit[]; note: string }> {
  for (const root of roots) {
    if (!(await robotsAllows(root).catch(() => false))) return { hits: [], note: `robots.txt disallows ${root}` };
    try {
      const { html } = await politeHtml(root);
      const hits = links(html, root);
      if (hits.length) return { hits, note: `via ${root}` };
    } catch (err) {
      if (root === roots[roots.length - 1]) {
        return { hits: [], note: `${root}: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  }
  return { hits: [], note: "reachable, no excess-proceeds link found on the entry pages" };
}

async function main() {
  const out: Array<Record<string, unknown>> = [];
  for (const c of COUNTIES) {
    const { hits, note } = await findExcessPages(c.roots);
    if (!hits.length) {
      out.push({ county: c.county, state: "CA", ok: false, note, links: [], probe: null });
      console.log(`MISS ${c.county.padEnd(15)} ${note}`);
      continue;
    }
    let best: Record<string, unknown> | null = null;
    for (const h of hits.slice(0, 3)) {
      const p = await probe(c.county, h.href);
      if (!best || (p.ok && !best.ok)) best = p;
      if (p.ok) break;
    }
    out.push({ county: c.county, state: "CA", ok: Boolean(best?.ok), note, links: hits, probe: best });
    const p = best ?? { ok: false, handler: "unknown", note: "no probe" };
    console.log(`${p.ok ? "OK  " : "MISS"} ${c.county.padEnd(15)} ${String(p.handler).padEnd(11)} ${note}\n     ${p.note}`);
    if (p.suggested && Object.keys(p.suggested as object).length) console.log(`     suggested: ${JSON.stringify(p.suggested)}`);
    if (p.ok && (p.docLinks as string[] | undefined)?.length) console.log(`     docs: ${(p.docLinks as string[]).slice(0, 3).join(" | ")}`);
  }

  mkdirSync("reports", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(`reports/ca-surplus-${stamp}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), state: "CA", probes: out }, null, 2));
  console.log(`\n${out.filter((p) => p.ok).length} candidate(s). Report: reports/ca-surplus-${stamp}.json`);
}

if (import.meta.main) void main();
