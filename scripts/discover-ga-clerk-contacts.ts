#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Round 4 (Georgia): find the excess-funds custodian for the two GA counties whose
// surplus pages block automation. In Georgia tax-sale excess funds sit with the
// Tax Commissioner, not the Superior Court clerk, so both are probed.
//
//   bun run scripts/discover-ga-clerk-contacts.ts
//
// Reads the homepage (and sitemap.xml when present), follows the links whose
// text or href names a records/excess-funds desk, and extracts published
// addresses from those pages. Seeds nothing.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { proxyUrl, REALAUCTION_USER_AGENT } from "../src/lib/data-providers/realauction-proxy";
import { stripTags } from "../src/lib/surplus/handlers/html-table";

const COUNTIES: Array<{ county: string; state: string; site: string }> = [
  { county: "Clayton", state: "GA", site: "https://www.claytoncountyga.gov" },
  { county: "Clayton", state: "GA", site: "https://www.claytoncountyga.gov/government/tax-commissioner" },
  { county: "Cobb", state: "GA", site: "https://www.cobbtax.org" },
  { county: "Cobb", state: "GA", site: "https://www.cobbsuperiorcourtclerk.com" },
];

const LINKY = /contact|public\s*record|records\s*request|tax\s*deed|surplus|unclaimed|excess|finance|comptroller|custodian|tax\s*sale/i;
const GENERIC = /^(webmaster|postmaster|noreply|no-reply|donotreply|abuse|privacy|jobs|hr|media|press)@/i;
const RELEVANT = /records|tax\s*deed|surplus|unclaimed|excess|finance|comptroller|custodian|foia|sunshine|public\s*record/i;
const ADDRESS = /^[\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}$/i;
const VERSIONISH = /@\d|\.\d+$/;

const isReal = (e: string) => ADDRESS.test(e) && !VERSIONISH.test(e) && !GENERIC.test(e);
const clean = (r: string) => r.trim().toLowerCase().replace(/^mailto:/, "").replace(/[.,;:)\]}>'"]+$/, "");
const nearby = (h: string, at: number) => stripTags(h.slice(Math.max(0, at - 400), at + 400)).replace(/\s+/g, " ");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Found = { email: string; label: string; page: string; relevant: boolean };

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

async function get(url: string): Promise<string> {
  const px = proxyUrl();
  const init: RequestInit & { proxy?: string } = {
    headers: { Accept: "text/html,application/xhtml+xml,application/xml", "User-Agent": REALAUCTION_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  };
  if (px) init.proxy = px;
  const res = await fetch(url, init as RequestInit);
  return res.ok ? await res.text() : "";
}

/** Candidate pages: same-origin links whose text or href names a records/contact desk. */
function candidates(html: string, site: string): string[] {
  const origin = new URL(site).origin;
  const urls = new Map<string, true>();
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1] ?? "").trim();
    const text = stripTags(m[2] ?? "").replace(/\s+/g, " ").trim();
    if (!LINKY.test(`${text} ${href}`)) continue;
    let abs: string;
    try { abs = new URL(href, site).toString(); } catch { continue; }
    if (!abs.startsWith(origin) || /\.(pdf|jpg|png|zip|xlsx?)$/i.test(abs)) continue;
    urls.set(abs.split("?")[0]!, true);
  }
  return [...urls.keys()].slice(0, 6);
}

/** Excess funds in GA are administered by the Tax Commissioner. */
/** sitemap.xml often lists the records page even when the nav is JS-rendered. */
function sitemapCandidates(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    const u = (m[1] ?? "").trim();
    if (LINKY.test(u)) out.push(u);
  }
  return out.slice(0, 6);
}

async function main() {
  console.log(proxyUrl() ? "Proxy: residential egress" : "Proxy: NOT configured");
  const report: Array<Record<string, unknown>> = [];
  for (const c of COUNTIES) {
    const found = new Map<string, Found>();
    const notes: string[] = [];
    let pages: string[] = [];
    try {
      const home = await get(c.site);
      pages = candidates(home, c.site);
      for (const f of emailsFrom(home, c.site)) if (!found.has(f.email)) found.set(f.email, f);
    } catch (e) { notes.push(`home: ${e instanceof Error ? e.message : String(e)}`); }
    await sleep(3000);
    if (pages.length < 2) {
      try {
        const sm = await get(`${new URL(c.site).origin}/sitemap.xml`);
        pages = [...new Set([...pages, ...sitemapCandidates(sm)])];
      } catch { notes.push("sitemap: unreachable"); }
      await sleep(3000);
    }
    for (const p of pages.slice(0, 6)) {
      try {
        const html = await get(p);
        if (!html) { notes.push(`${p}: empty/blocked`); continue; }
        for (const f of emailsFrom(html, p)) if (!found.has(f.email)) found.set(f.email, f);
      } catch (e) { notes.push(`${p}: ${e instanceof Error ? e.message : String(e)}`); }
      await sleep(3000);
    }
    const all = [...found.values()].sort((a, b) => Number(b.relevant) - Number(a.relevant));
    const best = all.filter((f) => f.relevant);
    report.push({ county: c.county, state: c.state, site: c.site, pagesTried: pages, contacts: all, notes });
    console.log(`${best.length ? "OK  " : "MISS"} ${c.county.padEnd(11)} ${pages.length} page(s), ${all.length} addr, ${best.length} relevant`);
    for (const f of best.slice(0, 3)) console.log(`     ${f.email} — ${f.label} (${f.page})`);
    if (!best.length && notes.length) console.log(`     ${notes.slice(0, 2).join(" | ")}`);
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/ga-clerk-contacts.json", JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log("\nNothing seeded. Confirm each address before use.");
}

void main();
