// RealeFlow lead-type entitlement probe — can our account SOURCE (not just
// enrich) the record types the boss asked for?
//
// The county-source sweep proved pre-foreclosure / tax-default / probate have
// ZERO open GIS data in FL (0/67 each — clerk-of-court records). RealeFlow's
// /search leadTypes filter is the lawful alternative: the vendor licenses the
// courthouse data. This probe checks, per lead type, whether our dev account
// gets rows back for one FL county (Hillsborough 12057) — entitlements gate
// leadTypes server-side, so a silent empty result means "not licensed".
//
// Read-only, one request per type, creds from .env (never printed).
// Run: node scripts/realeflow-leadtypes-probe.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const BASE = env.REALEFLOW_BASE_URL?.replace(/\/+$/, "");
const HEADERS = {
  "X-RF-Partner-Api-Key": env.REALEFLOW_API_KEY,
  "X-RF-Partner-Account-Id": env.REALEFLOW_ACCOUNT_ID,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "LeadTrace-Integration/1.0 (+github.com/realelite)",
};

const FIPS = process.env.FIPS ?? "12057"; // Hillsborough
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(body) {
  const res = await fetch(`${BASE}/api/2.0/leadpipes/search`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

// Boss's list mapped to RealeFlow filters (docs: reference-enums, endpoints-search):
const PROBES = [
  { label: "pre_foreclosure", body: { leadTypes: { include: ["PRE_FORECLOSURE"] } } },
  // FORECLOSURE_ACTIVITY was RETIRED by RealeFlow (Tyler, 2026-08-24): a legacy
  // combined category, removed from the Property Data API. A 400 here is now the
  // EXPECTED result — use FORECLOSURE + PRE_FORECLOSURE together to recreate it.
  { label: "foreclosure_activity (RETIRED — 400 expected)", body: { leadTypes: { include: ["FORECLOSURE_ACTIVITY"] } } },
  { label: "tax_delinquent (RECENTLY_DELINQUENT)", body: { leadTypes: { include: ["RECENTLY_DELINQUENT"] } } },
  { label: "tax_lien (TAX_GOVERNMENT_LIEN)", body: { lienTypes: ["TAX_GOVERNMENT_LIEN"] } },
  { label: "probate (DECEASED_PROBATE)", body: { lienTypes: ["DECEASED_PROBATE"] } },
  { label: "probate-ish (POTENTIALLY_INHERITED)", body: { leadTypes: { include: ["POTENTIALLY_INHERITED"] } } },
  { label: "zombie/vacancy", body: { leadTypes: { include: ["ZOMBIE_PROPERTY", "VACANCY"] } } },
];

console.log(`RealeFlow lead-type entitlement probe — county fips ${FIPS}\n`);
const results = [];
for (const p of PROBES) {
  const body = { places: [{ state: "FL", fips: FIPS }], size: 3, ...p.body };
  const r = await search(body);
  const rows = r.json?.data ?? r.json?.results ?? [];
  const total = r.json?.total ?? r.json?.meta?.total ?? null;
  const ok = r.status === 200 && Array.isArray(rows) && rows.length > 0;
  results.push({ label: p.label, status: r.status, rows: Array.isArray(rows) ? rows.length : 0, total });
  console.log(
    `${ok ? "OK  " : "MISS"} ${p.label.padEnd(38)} http=${r.status} rows=${Array.isArray(rows) ? rows.length : "?"} total=${total ?? "?"}` +
      (!ok && r.json ? ` — ${JSON.stringify(r.json).slice(0, 180)}` : ""),
  );
  if (ok && rows[0]) {
    const s = rows[0];
    const addr =
      s.address ?? s.full_address ?? s.situs_address ?? s.situs_std_full_street_address ??
      s.property_address ?? s.std_full_street_address ?? null;
    console.log(`     sample addr: ${addr ?? "(no obvious address key)"}`);
    if (!addr) console.log(`     row keys: ${Object.keys(s).slice(0, 25).join(", ")}`);
  }
  await sleep(1500);
}

console.log("\nVerdict: OK types can be SOURCED from RealeFlow per county (no scraping needed).");
console.log("MISS with http=200/empty likely means the dev account lacks that entitlement — ask Tyler.");
