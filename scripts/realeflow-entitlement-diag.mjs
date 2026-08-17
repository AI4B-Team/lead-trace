// Diagnostic — why do PRE_FORECLOSURE / FORECLOSURE_ACTIVITY /
// RECENTLY_DELINQUENT return 400 "not available on this account" even after
// account 192423 was moved to SitePlan 589 (HasPremiumLeads=true)?
//
// This gathers evidence, changes NOTHING:
//   1. Full Account Details JSON (all entitlement flags).
//   2. A /search with NO leadTypes — per the docs, the API substitutes the
//      account's FULL available lead-type list, so the returned rows reveal
//      which types are actually entitled.
//   3. A /search with an EMPTY leadTypes.include array (same substitution).
//   4. Probe each premium type individually to reconfirm the 400.
//
// Read-only. Creds from .env. Run: node scripts/realeflow-entitlement-diag.mjs
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
const API_KEY = env.REALEFLOW_API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID ?? env.REALEFLOW_ACCOUNT_ID ?? "192423";
const FIPS = Number(process.env.FIPS ?? "12057"); // Hillsborough

const PARTNER_HEADERS = {
  "X-RF-Partner-Api-Key": API_KEY,
  "X-RF-Partner-Account-Id": ACCOUNT_ID,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "LeadTrace-Integration/1.0 (+github.com/realelite)",
};

async function search(body) {
  const res = await fetch(`${BASE}/api/2.0/leadpipes/search`, {
    method: "POST",
    headers: PARTNER_HEADERS,
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

console.log(`Entitlement diagnostic — account ${ACCOUNT_ID}, base ${BASE}\n`);

// 1. Account Details (Account Management API, key query-param).
{
  const url = `${BASE}/api/account?key=${encodeURIComponent(API_KEY)}&AccountId=${encodeURIComponent(ACCOUNT_ID)}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": PARTNER_HEADERS["User-Agent"] } });
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    console.log("=== 1. ACCOUNT DETAILS (all flags) ===");
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "boolean" || /plan|premium|lead|territ|ai/i.test(k)) {
        console.log(`  ${k}: ${v}`);
      }
    }
  } catch {
    console.log("Account details not JSON:", text.slice(0, 120));
  }
  console.log("");
}

// 2. Search with NO leadTypes — docs say API returns the account's full set.
{
  console.log("=== 2. SEARCH with NO leadTypes (reveals entitled set) ===");
  const r = await search({ places: [{ state: "FL", fips: FIPS }], size: 3 });
  const rows = r.json?.data ?? r.json?.results ?? [];
  console.log(`  status ${r.status}, rows ${Array.isArray(rows) ? rows.length : "?"}`);
  // Look for any lead-type / leadpipes markers on the first row.
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row) {
    const keys = Object.keys(row).filter((k) => /lead|pipe|foreclos|delinqu|preforeclos/i.test(k));
    console.log(`  lead/pipe-ish keys on row: ${keys.join(", ") || "(none)"}`);
    const lp = row.leadpipes ?? row.Leadpipes ?? row.leadPipes ?? null;
    if (lp && typeof lp === "object") console.log(`  Leadpipes flags: ${Object.keys(lp).join(", ")}`);
  }
  // Some responses echo available facets/aggregations.
  const facets = r.json?.aggregations ?? r.json?.facets ?? r.json?.histograms ?? null;
  if (facets) console.log(`  facet keys: ${Object.keys(facets).join(", ")}`);
  console.log("");
}

// 3. Search with EMPTY include array.
{
  console.log("=== 3. SEARCH with empty leadTypes.include ===");
  const r = await search({ places: [{ state: "FL", fips: FIPS }], size: 3, leadTypes: { include: [] } });
  const rows = r.json?.data ?? r.json?.results ?? [];
  console.log(`  status ${r.status}, rows ${Array.isArray(rows) ? rows.length : "?"} ${r.status >= 400 ? JSON.stringify(r.json) : ""}`);
  console.log("");
}

// 4. Reconfirm each premium type individually.
console.log("=== 4. PREMIUM TYPES individually ===");
for (const t of ["PRE_FORECLOSURE", "FORECLOSURE_ACTIVITY", "RECENTLY_DELINQUENT", "FORECLOSURE"]) {
  const r = await search({ places: [{ state: "FL", fips: FIPS }], size: 1, leadTypes: { include: [t] } });
  const msg = r.json?.Message ?? r.json?.message ?? "";
  const rows = r.json?.data ?? r.json?.results ?? [];
  console.log(`  ${t}: http=${r.status} rows=${Array.isArray(rows) ? rows.length : "?"} ${msg}`);
}
