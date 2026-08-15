#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Find the real tax deed / surplus page on a clerk site instead of guessing it.
//
//   bun run scripts/discover-fl-clerk-links.ts
//
// Batch 2 produced 404s and TLS failures on hand-written URLs. Rather than
// guess again, fetch each clerk's entry point (root, then sitemap) and report
// the links whose text or href mentions tax deeds, surplus, overbid or
// unclaimed funds. Probe only: nothing is written or promoted.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { robotsAllows, politeHtml } from "../src/lib/data-providers/scraper-policy";
import { stripTags } from "../src/lib/surplus/handlers/html-table";

/** Entry points to try per county, in preference order. */
const COUNTIES: Array<{ county: string; roots: string[] }> = [
  { county: "Orange", roots: ["https://myorangeclerk.com/", "https://myorangeclerk.com/sitemap.xml"] },
  { county: "Charlotte", roots: ["https://www.charlotteclerk.com/", "https://www.charlotteclerk.com/sitemap.xml"] },
  { county: "Seminole", roots: ["https://seminoleclerk.org/", "https://www.seminoleclerk.org/"] },
  { county: "St. Lucie", roots: ["https://www.stlucieclerk.com/", "https://stlucieclerk.gov/"] },
  { county: "Alachua", roots: ["https://www.alachuaclerk.org/", "https://alachuaclerk.com/"] },
  { county: "Collier", roots: ["https://www.collierclerk.com/"] },
  { county: "Clay", roots: ["https://www.clayclerk.com/"] },
  { county: "Bay", roots: ["https://www.baycoclerk.com/"] },
  { county: "Highlands", roots: ["https://www.hcclerk.org/"] },
  { county: "Indian River", roots: ["https://www.clerk.indian-river.org/"] },
  { county: "Nassau", roots: ["https://www.nassauclerk.com/"] },
  { county: "Okaloosa", roots: ["https://www.okaloosaclerk.com/"] },
];

const RELEVANT = /tax.?deed|surplus|overbid|excess\s*(funds|proceeds)|unclaimed/i;

export type Hit = { text: string; href: string };

export function links(html: string, base: string): Hit[] {
  const out = new Map<string, Hit>();
  // Anchors carrying the phrase in either the label or the target.
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!;
    const text = stripTags(m[2] ?? "").replace(/\s+/g, " ").trim();
    if (!RELEVANT.test(text) && !RELEVANT.test(href)) continue;
    try {
      const abs = new URL(href, base).toString();
      if (!/^https?:/.test(abs)) continue;
      if (!out.has(abs)) out.set(abs, { text: text.slice(0, 70), href: abs });
    } catch { /* unparsable href */ }
  }
  // Sitemaps have no anchors — match <loc> entries too.
  for (const m of html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const abs = m[1]!;
    if (RELEVANT.test(abs) && !out.has(abs)) out.set(abs, { text: "(sitemap)", href: abs });
  }
  return [...out.values()].slice(0, 12);
}

async function main() {
  const report: Array<Record<string, unknown>> = [];
  for (const c of COUNTIES) {
    let found: Hit[] = [];
    let note = "";
    for (const root of c.roots) {
      if (!(await robotsAllows(root).catch(() => false))) { note = "robots.txt disallows"; continue; }
      try {
        const { html } = await politeHtml(root);
        found = links(html, root);
        note = found.length ? `via ${root}` : `reachable, no tax-deed link on ${root}`;
        if (found.length) break;
      } catch (err) {
        note = `${root}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    report.push({ county: c.county, note, links: found });
    console.log(`${found.length ? "OK  " : "MISS"} ${c.county.padEnd(13)} ${note}`);
    for (const h of found) console.log(`       - ${h.text} -> ${h.href}`);
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/fl-clerk-links.json", JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log("\nReport: reports/fl-clerk-links.json");
}

void main();
