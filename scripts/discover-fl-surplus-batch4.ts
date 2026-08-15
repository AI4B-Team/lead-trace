#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Batch 4: the WAF counties that the widened residential proxy scope reopened.
//
//   bun run scripts/discover-fl-surplus-batch4.ts
//
// Pages come from scripts/discover-fl-clerk-waf.ts (the clerks' own links, not
// guesses). Probe only — a dollar column is never mapped without a human
// confirming it against the real file.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { probe } from "./discover-fl-surplus-batch3";

const CANDIDATES: Array<{ county: string; urls: string[] }> = [
  { county: "Duval", urls: [
    "https://www.duvalclerk.com/departments/finance-and-accounting/unclaimed-funds",
    "https://www.duvalclerk.com/online-option/tax-deed-auctions",
  ] },
  { county: "Leon", urls: [
    "https://leonclerk.com/helpful-resources/records/unclaimed-money/",
    "https://leonclerk.com/divisions/property-sales/tax-deeds/",
  ] },
  { county: "Pasco", urls: [
    "https://www.pascoclerk.com/CivicAlerts.aspx?AID=316",
    "https://www.pascoclerk.com/280/Unclaimed-Funds",
  ] },
];

async function main() {
  const probes: Array<Record<string, unknown>> = [];
  for (const c of CANDIDATES) {
    for (const url of c.urls) {
      const p = await probe(c.county, url);
      probes.push(p);
      console.log(`${p.ok ? "OK  " : "MISS"} ${c.county.padEnd(8)} ${String(p.handler).padEnd(11)} ${url}\n     ${p.note}`);
      if (Object.keys(p.suggested as object).length) console.log(`     suggested: ${JSON.stringify(p.suggested)}`);
      if ((p.docLinks as string[]).length) console.log(`     docs: ${(p.docLinks as string[]).slice(0, 3).join(" | ")}`);
      if (p.ok) break;
    }
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/fl-surplus-batch4.json", JSON.stringify({ generatedAt: new Date().toISOString(), probes }, null, 2));
  console.log(`\n${probes.filter((p) => p.ok).length} candidate(s). Report: reports/fl-surplus-batch4.json`);
}

if (import.meta.main) void main();
