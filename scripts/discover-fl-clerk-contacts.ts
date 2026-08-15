#!/usr/bin/env bun
// ---------------------------------------------------------------------------
// Florida clerk records-request contacts.
//
//   bun run scripts/discover-fl-clerk-contacts.ts
//
// Counties whose surplus lists are not collectable by crawl (image-only PDFs,
// claim forms only, robots-disallowed portals, datacenter-IP WAFs) can still be
// served through the records-request handler — but that handler needs an
// agency_contacts row, and an invented email means a request that silently goes
// nowhere. So this is a probe: it reads each clerk's own contact/public-records
// pages, records the addresses THEY publish along with the page each came from,
// and writes a report for confirmation. It seeds nothing.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { politeHtml, robotsAllows } from "../src/lib/data-providers/scraper-policy";
import { stripTags } from "../src/lib/surplus/handlers/html-table";

/** Counties with no crawlable surplus list, from batch 2/3 probes. */
const COUNTIES: Array<{ county: string; site: string; blockedBy: string }> = [
  { county: "Clay", site: "https://clayclerk.com", blockedBy: "list published as a single image PDF" },
  { county: "St. Lucie", site: "https://www.stlucieclerk.com", blockedBy: "claim form only" },
  { county: "Bay", site: "https://www.baycoclerk.com", blockedBy: "claim form only" },
  { county: "Okaloosa", site: "https://okaloosaclerk.com", blockedBy: "claim instructions only" },
  { county: "Nassau", site: "https://www.nassauclerk.com", blockedBy: "sale notices only" },
  { county: "Charlotte", site: "https://www.charlotteclerk.com", blockedBy: "tax deed portal robots-disallowed" },
  { county: "Collier", site: "https://www.collierclerk.com", blockedBy: "pages time out" },
  { county: "Duval", site: "https://www.duvalclerk.com", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Lee", site: "https://www.leeclerk.org", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Lake", site: "https://www.lakecountyclerk.org", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Escambia", site: "https://www.escambiaclerk.com", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Leon", site: "https://cvweb.leonclerk.com", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Pasco", site: "https://www.pascoclerk.com", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Pinellas", site: "https://www.mypinellasclerk.gov", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Highlands", site: "https://www.hcclerk.org", blockedBy: "403 WAF on datacenter IPs" },
  { county: "Seminole", site: "https://www.seminoleclerk.org", blockedBy: "invalid TLS chain" },
];

/** Paths clerks conventionally use for records/contact desks. */
const PATHS = ["/", "/contact", "/contact-us", "/public-records", "/public-records-request", "/records-request"];

const GENERIC = /^(webmaster|postmaster|noreply|no-reply|donotreply|abuse|privacy|jobs|hr|media|press)@/i;
// "clerk" is on every page of a clerk's site, so it cannot signal the records
// desk. Relevance has to come from words that name the function.
const RELEVANT = /records|tax\s*deed|surplus|unclaimed|finance|comptroller|custodian|foia|sunshine|public\s*record/i;
// Markup is full of things shaped like an address: bootstrap@5.0.2, wght@400..700,
// @font-face srcs. Require a real TLD and reject version specifiers.
const ADDRESS = /^[\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}$/i;
const VERSIONISH = /@\d|\.\d+$/;

function isRealAddress(email: string): boolean {
  return ADDRESS.test(email) && !VERSIONISH.test(email) && !GENERIC.test(email);
}

type Found = { email: string; label: string; page: string; relevant: boolean };

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms (${label})`)), ms)),
  ]);
}

function emailsFrom(html: string, page: string): Found[] {
  const out = new Map<string, Found>();

  // mailto links carry their own anchor text, which is the best label available.
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']mailto:([^"'?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const email = cleanAddress(m[1] ?? "");
    const label = stripTags(m[2] ?? "").replace(/\s+/g, " ").trim();
    if (!isRealAddress(email)) continue;
    const context = `${label} ${nearbyText(html, m.index ?? 0)}`;
    out.set(email, { email, label: label || "(no anchor text)", page, relevant: RELEVANT.test(context) || RELEVANT.test(email) });
  }

  // Plain-text addresses, for sites that print rather than link them.
  for (const m of html.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g)) {
    const email = cleanAddress(m[0]);
    if (out.has(email) || !isRealAddress(email)) continue;
    const context = nearbyText(html, m.index ?? 0);
    out.set(email, { email, label: "(plain text)", page, relevant: RELEVANT.test(context) || RELEVANT.test(email) });
  }

  return [...out.values()];
}

/** Prose runs addresses into sentences: "email clayarchives@clayclerk.com." */
function cleanAddress(raw: string): string {
  return raw.trim().toLowerCase().replace(/^mailto:/, "").replace(/[.,;:)\]}>'"]+$/, "");
}

/** Surrounding copy decides whether an address is the records desk or the IT helpdesk. */
function nearbyText(html: string, at: number): string {
  return stripTags(html.slice(Math.max(0, at - 400), at + 400)).replace(/\s+/g, " ");
}

async function main() {
  const report: Array<Record<string, unknown>> = [];

  for (const c of COUNTIES) {
    const found = new Map<string, Found>();
    const notes: string[] = [];

    for (const path of PATHS) {
      const url = `${c.site}${path}`;
      const allowed = await withTimeout(robotsAllows(url), 15_000, "robots").catch(() => false);
      if (!allowed) { notes.push(`${path}: robots disallows`); continue; }
      try {
        const { html } = await withTimeout(politeHtml(url), 25_000, "page");
        for (const f of emailsFrom(html, url)) if (!found.has(f.email)) found.set(f.email, f);
      } catch (err) {
        notes.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const all = [...found.values()].sort((a, b) => Number(b.relevant) - Number(a.relevant));
    report.push({ county: c.county, state: "FL", site: c.site, blockedBy: c.blockedBy, contacts: all, notes });

    const best = all.filter((f) => f.relevant);
    console.log(
      `${best.length ? "OK  " : "MISS"} ${c.county.padEnd(11)} ${String(all.length).padStart(2)} address(es), ${best.length} records-relevant`,
    );
    for (const f of best.slice(0, 3)) console.log(`     ${f.email} — ${f.label} (${f.page})`);
    if (!all.length && notes.length) console.log(`     ${notes.slice(0, 2).join(" | ")}`);
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/fl-clerk-contacts.json", JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  const withContact = report.filter((r) => (r.contacts as Found[]).some((c) => c.relevant)).length;
  console.log(`\n${withContact}/${COUNTIES.length} counties have a records-relevant published address. Report: reports/fl-clerk-contacts.json`);
  console.log("Nothing seeded. Confirm each address before it is used to send a request.");
}

void main();
