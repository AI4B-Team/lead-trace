#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Batch 5 of Florida clerk-primary surplus discovery — the counties not yet
// probed in batches 2-4 (Hillsborough/Pasco/Pinellas/Polk/Duval/Leon/Bay/
// Charlotte/Clay/Collier/Nassau/Okaloosa/St. Lucie already covered; Marion is
// live; Sarasota/Osceola/Sumter checked in the 2026-08-13 report).
//
//   bun run scripts/discover-fl-surplus-batch5.ts
//
// Method (reuses the boss's own building blocks, no new scraping logic):
//   1. `links()` from discover-fl-clerk-links.ts finds the REAL tax-deed /
//      surplus page from each clerk's homepage + sitemap (no guessed URLs, which
//      is what made batch 2 return 404s).
//   2. `probe()` from discover-fl-surplus-batch3.ts checks whether that page
//      actually publishes a machine-readable held-surplus LIST (vs a claim form,
//      via doc-classify) and suggests a column map for a human to confirm.
//
// Probe only. Nothing is written to the DB or promoted to 'live': a guessed
// dollar column is a wrong figure shown to a customer, so a human confirms the
// mapping first. robots.txt is enforced per request inside politeFetch.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { robotsAllows, politeHtml } from "../src/lib/data-providers/scraper-policy";
import { links, type Hit } from "./discover-fl-clerk-links";
import { probe } from "./discover-fl-surplus-batch3";

/** Clerk homepages for counties not yet probed. Roots only — the real tax-deed
 *  / surplus page is discovered from each homepage, never hand-written. */
const COUNTIES: Array<{ county: string; roots: string[] }> = [
  { county: "Brevard", roots: ["https://www.brevardclerk.us/", "https://www.brevardclerk.us/sitemap.xml"] },
  { county: "Volusia", roots: ["https://www.clerk.org/", "https://www.clerk.org/sitemap.xml"] },
  { county: "Manatee", roots: ["https://www.manateeclerk.com/", "https://www.manateeclerk.com/sitemap.xml"] },
  { county: "Sarasota", roots: ["https://www.sarasotaclerk.com/", "https://www.sarasotaclerk.com/sitemap.xml"] },
  { county: "Osceola", roots: ["https://www.osceolaclerk.com/", "https://www.osceolaclerk.org/"] },
  { county: "Sumter", roots: ["https://www.sumterclerk.com/", "https://www.sumterclerk.com/sitemap.xml"] },
  { county: "Martin", roots: ["https://www.martinclerk.com/", "https://www.martinclerk.com/sitemap.xml"] },
  { county: "Monroe", roots: ["https://www.monroe-clerk.com/", "https://monroe-clerk.com/"] },
  { county: "Flagler", roots: ["https://www.flaglerclerk.com/", "https://flaglerclerk.com/"] },
  { county: "Citrus", roots: ["https://www.citrusclerk.org/", "https://citrusclerk.org/sitemap.xml"] },
  { county: "Hernando", roots: ["https://www.hernandoclerk.com/", "https://www.hernandoclerk.org/"] },
  { county: "St. Johns", roots: ["https://www.stjohnsclerk.com/", "https://stjohnsclerk.com/"] },
  { county: "Santa Rosa", roots: ["https://www.santarosaclerk.com/", "https://santarosaclerk.com/"] },
  { county: "Marion", roots: ["https://www.marioncountyclerk.org/", "https://marioncountyclerk.org/"] },
  { county: "Putnam", roots: ["https://www.putnam-fl.gov/", "https://www.putnamclerk.com/"] },
  { county: "Indian River", roots: ["https://www.clerk.indian-river.org/", "https://indian-river.org/"] },
  { county: "Highlands", roots: ["https://www.hcclerk.org/", "https://hcclerk.org/sitemap.xml"] },
  { county: "Lake", roots: ["https://www.lakecountyclerk.org/", "https://lakecountyclerk.org/"] },
  { county: "Lee", roots: ["https://www.leeclerk.org/", "https://leeclerk.org/sitemap.xml"] },
  { county: "Escambia", roots: ["https://www.escambiaclerk.com/", "https://escambiaclerk.com/"] },
];

async function findSurplusPages(roots: string[]): Promise<{ hits: Hit[]; note: string }> {
  for (const root of roots) {
    if (!(await robotsAllows(root).catch(() => false))) return { hits: [], note: `robots.txt disallows ${root}` };
    try {
      const { html } = await politeHtml(root);
      const hits = links(html, root);
      if (hits.length) return { hits, note: `via ${root}` };
    } catch (err) {
      // try the next root; report the last error if none work
      if (root === roots[roots.length - 1]) {
        return { hits: [], note: `${root}: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  }
  return { hits: [], note: "reachable, no tax-deed/surplus link found" };
}

async function main() {
  const out: Array<Record<string, unknown>> = [];
  for (const c of COUNTIES) {
    const { hits, note } = await findSurplusPages(c.roots);
    if (!hits.length) {
      out.push({ county: c.county, ok: false, note, links: [], probe: null });
      console.log(`MISS ${c.county.padEnd(13)} ${note}`);
      continue;
    }
    // Probe the discovered surplus/tax-deed pages (best candidates first).
    let best: Record<string, unknown> | null = null;
    for (const h of hits.slice(0, 3)) {
      const p = await probe(c.county, h.href);
      if (!best || (p.ok && !best.ok)) best = p;
      if (p.ok) break;
    }
    out.push({ county: c.county, ok: Boolean(best?.ok), note, links: hits, probe: best });
    const p = best ?? { ok: false, handler: "unknown", note: "no probe" };
    console.log(`${p.ok ? "OK  " : "MISS"} ${c.county.padEnd(13)} ${String(p.handler).padEnd(11)} ${note}\n     ${p.note}`);
    if (p.suggested && Object.keys(p.suggested as object).length) console.log(`     suggested: ${JSON.stringify(p.suggested)}`);
    if (p.ok && (p.docLinks as string[] | undefined)?.length) console.log(`     docs: ${(p.docLinks as string[]).slice(0, 3).join(" | ")}`);
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/fl-surplus-batch5.json", JSON.stringify({ generatedAt: new Date().toISOString(), probes: out }, null, 2));
  console.log(`\n${out.filter((p) => p.ok).length} candidate(s). Report: reports/fl-surplus-batch5.json`);
}

if (import.meta.main) void main();

