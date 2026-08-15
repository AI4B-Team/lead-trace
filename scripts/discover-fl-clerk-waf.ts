#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Florida clerks that answer datacenter egress with a WAF 403.
//
//   bun run scripts/discover-fl-clerk-waf.ts
//
// These counties were unreadable in batch 2 — not because of robots.txt (it
// allows the paths) but because their WAF drops non-residential IPs. The
// residential proxy scope was widened to these clerk hosts, so this pass
// re-probes each one and reports the surplus / tax deed links it can now see.
//
// Probe only: nothing is seeded or promoted. robots is still enforced on every
// request by politeFetch; the proxy changes our IP, never our permission.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { politeHtml, robotsAllows } from "../src/lib/data-providers/scraper-policy";
import { requiresProxy } from "../src/lib/data-providers/realauction-proxy";
import { links, type Hit } from "./discover-fl-clerk-links";

const COUNTIES: Array<{ county: string; roots: string[] }> = [
  { county: "Duval", roots: ["https://www.duvalclerk.com/", "https://www.duvalclerk.com/sitemap.xml"] },
  { county: "Lee", roots: ["https://www.leeclerk.org/", "https://www.leeclerk.org/sitemap.xml"] },
  { county: "Lake", roots: ["https://www.lakecountyclerk.org/", "https://lakecountyclerk.org/"] },
  { county: "Escambia", roots: ["https://www.escambiaclerk.com/", "https://www.escambiaclerk.com/sitemap.xml"] },
  { county: "Leon", roots: ["https://cvweb.leonclerk.com/", "https://www.leonclerk.com/"] },
  { county: "Pasco", roots: ["https://www.pascoclerk.com/", "https://www.pascoclerk.com/sitemap.xml"] },
  { county: "Pinellas", roots: ["https://mypinellasclerk.gov/", "https://www.mypinellasclerk.gov/sitemap.xml"] },
  { county: "Highlands", roots: ["https://www.hcclerk.org/", "https://www.hcclerk.org/sitemap.xml"] },
];

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms (${label})`)), ms),
    ),
  ]);
}

async function main() {
  const report: Array<Record<string, unknown>> = [];
  for (const c of COUNTIES) {
    let hits: Hit[] = [];
    const notes: string[] = [];
    let proxied = false;
    for (const root of c.roots) {
      proxied = proxied || requiresProxy(root);
      if (!requiresProxy(root)) notes.push(`${root}: host not in proxy scope — fetched direct`);
      const allowed = await withTimeout(robotsAllows(root), 15_000, "robots").catch(() => true);
      if (!allowed) {
        notes.push(`${root}: robots.txt disallows`);
        continue;
      }
      try {
        const { html } = await withTimeout(politeHtml(root), 30_000, "page");
        hits = links(html, root);
        if (hits.length) break;
        notes.push(`${root}: reachable, no matching links`);
      } catch (err) {
        notes.push(`${root}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    report.push({ county: c.county, proxied, hits, notes });
    console.log(`${hits.length ? "OK  " : "MISS"} ${c.county.padEnd(10)} ${hits.length} link(s)`);
    for (const h of hits.slice(0, 5)) console.log(`     ${h.text || "(no label)"} -> ${h.href}`);
    for (const n of notes) console.log(`     ${n}`);
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/fl-clerk-waf-links.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2),
  );
  console.log(`\n${report.filter((r) => (r.hits as Hit[]).length).length} of ${COUNTIES.length} counties readable. Report: reports/fl-clerk-waf-links.json`);
}

if (import.meta.main) void main();
