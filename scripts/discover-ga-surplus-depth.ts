#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Georgia depth: the counties the Weissman aggregator workbooks do NOT cover.
//
//   bun run scripts/discover-ga-surplus-depth.ts
//
// In Georgia tax-sale excess funds are held by the TAX COMMISSIONER, so the
// entry point is the county government / tax commissioner site rather than the
// Superior Court clerk. Method reuses the boss's own building blocks:
//   1. `links()` (discover-fl-clerk-links.ts) finds the real excess-funds page
//      from each county's homepage + sitemap — no hand-written deep URLs, which
//      is what produced 404s in the FL batch 2 run.
//   2. `probe()` (discover-fl-surplus-batch3.ts) decides whether that page
//      publishes a machine-readable held-funds LIST (vs a claim form, via
//      doc-classify) and suggests a column map.
//
// Probe only. Nothing is written to the DB and nothing is promoted: a guessed
// dollar column is a wrong figure shown to a customer, so a human confirms the
// mapping first. robots.txt is enforced per request inside politeFetch.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { robotsAllows, politeHtml } from "../src/lib/data-providers/scraper-policy";
import { links, type Hit } from "./discover-fl-clerk-links";
import { probe } from "./discover-fl-surplus-batch3";

/** Uncovered GA counties, largest first. Roots only. */
const COUNTIES: Array<{ county: string; roots: string[] }> = [
  { county: "Chatham", roots: ["https://www.chathamcountyga.gov/", "https://www.chathamcountyga.gov/sitemap.xml"] },
  { county: "Richmond", roots: ["https://www.augustaga.gov/", "https://www.augustaga.gov/sitemap.xml"] },
  { county: "Bibb", roots: ["https://www.maconbibb.us/", "https://www.maconbibbtax.us/"] },
  { county: "Houston", roots: ["https://www.houstoncountyga.gov/", "https://www.houstoncountyga.gov/sitemap.xml"] },
  { county: "Paulding", roots: ["https://www.paulding.gov/", "https://www.paulding.gov/sitemap.xml"] },
  { county: "Coweta", roots: ["https://www.coweta.ga.us/", "https://www.coweta.ga.us/sitemap.xml"] },
  { county: "Carroll", roots: ["https://www.carrollcountyga.com/", "https://www.carrollcountyga.com/sitemap.xml"] },
  { county: "Whitfield", roots: ["https://www.whitfieldcountyga.gov/", "https://www.whitfieldcountyga.com/"] },
  { county: "Bartow", roots: ["https://www.bartowcountyga.gov/", "https://www.bartowga.org/"] },
  { county: "Floyd", roots: ["https://www.floydcountyga.gov/", "https://www.floydcountyga.org/"] },
  { county: "Fayette", roots: ["https://fayettecountyga.gov/", "https://fayettecountyga.gov/sitemap.xml"] },
  { county: "Glynn", roots: ["https://www.glynncounty.org/", "https://www.glynncounty.org/sitemap.xml"] },
  { county: "Camden", roots: ["https://www.camdencountyga.gov/", "https://www.co.camden.ga.us/"] },
  { county: "Walton", roots: ["https://www.waltoncountyga.gov/", "https://www.waltoncountyga.gov/sitemap.xml"] },
  { county: "Catoosa", roots: ["https://catoosa.com/", "https://www.catoosacountyga.gov/"] },
  { county: "Dougherty", roots: ["https://www.dougherty.ga.us/", "https://www.albanyga.gov/"] },
  { county: "Rockdale", roots: ["https://www.rockdalecountyga.gov/", "https://www.rockdalecountyga.gov/sitemap.xml"] },
  { county: "Laurens", roots: ["https://www.laurenscoga.org/", "https://laurenscountyga.gov/"] },
  { county: "Tift", roots: ["https://www.tiftcounty.org/", "https://tiftcounty.org/sitemap.xml"] },
  { county: "Ware", roots: ["https://www.warecounty.com/", "https://warecounty.com/sitemap.xml"] },
  { county: "Colquitt", roots: ["https://colquittcountyga.gov/", "https://www.colquittcountyga.gov/sitemap.xml"] },
  { county: "Lumpkin", roots: ["https://lumpkincounty.gov/", "https://www.lumpkincounty.gov/sitemap.xml"] },
  { county: "Hart", roots: ["https://www.hartcountyga.gov/", "https://hartcountyga.gov/sitemap.xml"] },
  { county: "Butts", roots: ["https://www.buttscountyga.gov/", "https://buttscountyga.com/"] },
  { county: "Elbert", roots: ["https://www.elbertcounty-ga.gov/", "https://elbertcounty-ga.gov/sitemap.xml"] },
  { county: "Monroe", roots: ["https://www.monroecountyga.gov/", "https://monroecountyga.gov/sitemap.xml"] },
  { county: "Upson", roots: ["https://www.upsoncountyga.org/", "https://upsoncountyga.org/sitemap.xml"] },
  { county: "Haralson", roots: ["https://www.haralsoncountyga.gov/", "https://www.haralson.org/"] },
  { county: "Madison", roots: ["https://www.madisonco.us/", "https://madisoncountyga.us/"] },
  { county: "Chattooga", roots: ["https://chattoogacountyga.gov/", "https://www.chattoogacounty.gov/"] },
];

const EXCESS = /excess|surplus|overbid|unclaimed|tax\s*sale/i;

async function main() {
  const out: Array<Record<string, unknown>> = [];
  for (const c of COUNTIES) {
    let hits: Hit[] = [];
    let rootNote = "";
    for (const root of c.roots) {
      if (!(await robotsAllows(root).catch(() => false))) { rootNote = "robots.txt disallows"; continue; }
      try {
        const { html } = await politeHtml(root);
        hits = links(html, root).filter((h) => EXCESS.test(h.text) || EXCESS.test(h.href));
        if (hits.length) { rootNote = `${hits.length} candidate link(s) from ${root}`; break; }
        rootNote = `reachable, no excess-funds link on ${root}`;
      } catch (err) {
        rootNote = err instanceof Error ? err.message : String(err);
      }
    }
    const probes: Array<Record<string, unknown>> = [];
    for (const h of hits.slice(0, 4)) {
      const p = await probe(c.county, h.href);
      probes.push({ ...p, linkText: h.text });
      if (p.ok) break;
    }
    const best = probes.find((p) => p.ok) ?? probes[0] ?? null;
    out.push({ county: c.county, state: "GA", rootNote, links: hits.slice(0, 6), probes });
    const flag = best?.ok ? "OK  " : "MISS";
    console.log(`${flag} ${c.county.padEnd(11)} ${String(best?.handler ?? "-").padEnd(11)} ${rootNote}`);
    if (best) console.log(`     ${best.url ?? ""}\n     ${best.note ?? ""}`);
    if (best?.ok && (best.docLinks as string[] | undefined)?.length) {
      console.log(`     docs: ${(best.docLinks as string[]).slice(0, 3).join(" | ")}`);
    }
    if (best && Object.keys((best.suggested ?? {}) as object).length) {
      console.log(`     suggested: ${JSON.stringify(best.suggested)}`);
    }
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/ga-surplus-depth.json", JSON.stringify({ generatedAt: new Date().toISOString(), counties: out }, null, 2));
  console.log(`\n${out.filter((c) => (c.probes as Array<{ ok?: boolean }>).some((p) => p.ok)).length}/${out.length} counties with a candidate list. Report: reports/ga-surplus-depth.json`);
}

if (import.meta.main) void main();
