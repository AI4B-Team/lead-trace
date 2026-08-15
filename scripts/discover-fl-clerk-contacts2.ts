#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Round 2 records-request contact probe, through the residential proxy.
//
//   bun run scripts/discover-fl-clerk-contacts2.ts
//
// Round 1 left most request-path counties without a custodian address because
// the clerk sites answered 403 to datacenter egress. This pass reuses the same
// extraction rules but routes every request through the residential proxy that
// the vendor fetcher uses, and covers the counties added to the request path
// since (Brevard, Citrus, Hernando, Polk, Sarasota, Volusia + GA Clayton/Cobb).
// It seeds nothing: addresses go to a report for confirmation.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { proxyUrl, REALAUCTION_USER_AGENT } from "../src/lib/data-providers/realauction-proxy";
import { stripTags } from "../src/lib/surplus/handlers/html-table";

const COUNTIES: Array<{ county: string; state: string; site: string }> = [
  { county: "Bay", state: "FL", site: "https://www.baycoclerk.com" },
  { county: "Brevard", state: "FL", site: "https://www.brevardclerk.us" },
  { county: "Charlotte", state: "FL", site: "https://www.charlotteclerk.com" },
  { county: "Citrus", state: "FL", site: "https://www.citrusclerk.gov" },
  { county: "Duval", state: "FL", site: "https://www.duvalclerk.com" },
  { county: "Escambia", state: "FL", site: "https://www.escambiaclerk.com" },
  { county: "Hernando", state: "FL", site: "https://www.hernandoclerk.com" },
  { county: "Highlands", state: "FL", site: "https://www.hcclerk.org" },
  { county: "Lake", state: "FL", site: "https://www.lakecountyclerk.org" },
  { county: "Lee", state: "FL", site: "https://www.leeclerk.org" },
  { county: "Leon", state: "FL", site: "https://www.leonclerk.com" },
  { county: "Nassau", state: "FL", site: "https://www.nassauclerk.com" },
  { county: "Okaloosa", state: "FL", site: "https://okaloosaclerk.com" },
  { county: "Pasco", state: "FL", site: "https://www.pascoclerk.com" },
  { county: "Pinellas", state: "FL", site: "https://www.mypinellasclerk.gov" },
  { county: "Polk", state: "FL", site: "https://www.polkcountyclerk.net" },
  { county: "Sarasota", state: "FL", site: "https://www.sarasotaclerk.com" },
  { county: "St. Lucie", state: "FL", site: "https://www.stlucieclerk.com" },
  { county: "Volusia", state: "FL", site: "https://www.clerk.org" },
  { county: "Clayton", state: "GA", site: "https://www.claytoncountyga.gov" },
  { county: "Cobb", state: "GA", site: "https://www.cobbtaxcommissioner.com" },
];

const PATHS = ["/", "/contact", "/contact-us", "/public-records", "/public-records-request", "/records-request"];
const GENERIC = /^(webmaster|postmaster|noreply|no-reply|donotreply|abuse|privacy|jobs|hr|media|press)@/i;
const RELEVANT = /records|tax\s*deed|surplus|unclaimed|excess|finance|comptroller|custodian|foia|sunshine|public\s*record/i;
const ADDRESS = /^[\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}$/i;
const VERSIONISH = /@\d|\.\d+$/;

type Found = { email: string; label: string; page: string; relevant: boolean };

const isReal = (e: string) => ADDRESS.test(e) && !VERSIONISH.test(e) && !GENERIC.test(e);
const clean = (raw: string) => raw.trim().toLowerCase().replace(/^mailto:/, "").replace(/[.,;:)\]}>'"]+$/, "");
const nearby = (html: string, at: number) => stripTags(html.slice(Math.max(0, at - 400), at + 400)).replace(/\s+/g, " ");

function emailsFrom(html: string, page: string): Found[] {
  const out = new Map<string, Found>();
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']mailto:([^"'?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const email = clean(m[1] ?? "");
    const label = stripTags(m[2] ?? "").replace(/\s+/g, " ").trim();
    if (!isReal(email)) continue;
    const ctx = `${label} ${nearby(html, m.index ?? 0)}`;
    out.set(email, { email, label: label || "(no anchor text)", page, relevant: RELEVANT.test(ctx) || RELEVANT.test(email) });
  }
  for (const m of html.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g)) {
    const email = clean(m[0]);
    if (out.has(email) || !isReal(email)) continue;
    out.set(email, { email, label: "(plain text)", page, relevant: RELEVANT.test(nearby(html, m.index ?? 0)) || RELEVANT.test(email) });
  }
  return [...out.values()];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchViaProxy(url: string): Promise<{ html: string; status: number }> {
  const px = proxyUrl();
  const init: RequestInit & { proxy?: string } = {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": REALAUCTION_USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  };
  if (px) init.proxy = px;
  const res = await fetch(url, init as RequestInit);
  return { html: res.ok ? await res.text() : "", status: res.status };
}

async function main() {
  console.log(proxyUrl() ? "Proxy: residential egress" : "Proxy: NOT configured — direct egress");
  const report: Array<Record<string, unknown>> = [];
  for (const c of COUNTIES) {
    const found = new Map<string, Found>();
    const notes: string[] = [];
    for (const path of PATHS) {
      const url = `${c.site}${path}`;
      try {
        const { html, status } = await fetchViaProxy(url);
        if (!html) { notes.push(`${path}: HTTP ${status}`); continue; }
        for (const f of emailsFrom(html, url)) if (!found.has(f.email)) found.set(f.email, f);
      } catch (err) {
        notes.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(3000);
    }
    const all = [...found.values()].sort((a, b) => Number(b.relevant) - Number(a.relevant));
    const best = all.filter((f) => f.relevant);
    report.push({ county: c.county, state: c.state, site: c.site, contacts: all, notes });
    console.log(`${best.length ? "OK  " : "MISS"} ${c.state} ${c.county.padEnd(11)} ${String(all.length).padStart(2)} addr, ${best.length} relevant`);
    for (const f of best.slice(0, 3)) console.log(`     ${f.email} — ${f.label} (${f.page})`);
    if (!all.length && notes.length) console.log(`     ${notes.slice(0, 2).join(" | ")}`);
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/fl-clerk-contacts-round2.json", JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log("\nNothing seeded. Confirm each address before it is used to send a request.");
}

void main();
