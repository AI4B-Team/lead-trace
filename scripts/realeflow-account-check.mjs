// RealElite Account Management API — check a given account's plan + entitlements.
//
// Per Tyler (RealeFlow, 2026-08-15): the Premium lead types (PRE_FORECLOSURE,
// FORECLOSURE_ACTIVITY, RECENTLY_DELINQUENT) come with Site Plan 589 (RF Pro
// with Premium Leads). To see what plan an account is on, and whether it has
// Premium Leads, call:
//
//   GET {BASE}/api/account?AccountId={id}
//   -> returns { SitePlanId, SitePlanName, HasPremiumLeads, ... }
//
// This authenticates with the SAME Partner API key (GUID) as the leadpipes API.
// The Partner API key is issued at the top level (not per-account): to check a
// different account you only change the AccountId query param / account header,
// there is NO new key. Docs: https://partners.realeflow.com/
//
// Read-only. Credentials come from .env and are never printed.
// Run:                 node scripts/realeflow-account-check.mjs
// Check other ids:     ACCOUNT_IDS=192423,227359 node scripts/realeflow-account-check.mjs
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
if (!BASE || !API_KEY) {
  console.error("Missing REALEFLOW_BASE_URL or REALEFLOW_API_KEY in .env");
  process.exit(1);
}

// GUID sanity check — the Partner API only accepts a GUID-format key. A
// self-service / in-app key (34-char alphanumeric) will 403 "invalid format".
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!GUID_RE.test(API_KEY)) {
  console.warn(
    `WARNING: REALEFLOW_API_KEY is not GUID-format (len ${API_KEY.length}). ` +
      `The Partner API will reject it with 403 "invalid format". Use the ` +
      `GUID Partner key Tyler sent (Bitwarden Send), not the in-app API key.\n`,
  );
}

// IMPORTANT — the Partner *Account Management* API (partners.realeflow.com docs)
// authenticates with the key as a QUERY PARAM `key=<GUID>`, NOT the
// `X-RF-Partner-Api-Key` header used by the leadpipes Property Data API.
//   GET {host}/api/account?key={KEY}&AccountId={realeflowNumericId}
//   GET {host}/api/account?key={KEY}&id={ExternalAccountId}
// The host in the public docs is `awesome.realeflow.com` (example partner);
// our provisioned white-label host is app.realelite.com. Try both.
const HEADERS = {
  Accept: "application/json",
  // Cloudflare on app.realelite.com blocks default non-browser user-agents.
  "User-Agent": "LeadTrace-Integration/1.0 (+github.com/realelite)",
};

// Hosts to try (first that returns JSON wins). Override with HOSTS=... env.
// The Account Management API host is not documented for us specifically (docs
// use the placeholder `awesome.realeflow.com`). Try the plausible candidates.
const hosts = (
  process.env.HOSTS ??
  [
    BASE, // app.realelite.com (our leadpipes host)
    "https://api.realeflow.com",
    "https://awesome.realeflow.com",
    "https://partners.realeflow.com",
  ].join(",")
)
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

// Default: check the account currently wired in .env, plus the known prod id.
const ids = (process.env.ACCOUNT_IDS ?? `${env.REALEFLOW_ACCOUNT_ID ?? ""},192423`)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const uniqueIds = [...new Set(ids)];

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { method: "GET", headers: HEADERS });
  } catch (e) {
    return { status: 0, json: `fetch failed: ${e.cause?.code ?? e.message}`, isJson: false };
  }
  const text = await res.text();
  let json;
  let isJson = false;
  try {
    json = JSON.parse(text);
    isJson = true;
  } catch {
    json = text.slice(0, 160).replace(/\s+/g, " ");
  }
  return { status: res.status, json, isJson };
}

function printAccount(id, j) {
  const planId = j.SitePlanId ?? j.sitePlanId ?? j.SitePlanID ?? "?";
  const planName = j.SitePlanName ?? j.sitePlanName ?? "?";
  const premium = j.HasPremiumLeads ?? j.hasPremiumLeads ?? "?";
  console.log(`  SitePlanId      : ${planId}`);
  console.log(`  SitePlanName    : ${planName}`);
  console.log(`  HasPremiumLeads : ${premium}`);
  console.log(`  (raw keys: ${Object.keys(j).slice(0, 20).join(", ")})`);
}

console.log(`RealElite/RealeFlow Account Management API check`);
console.log(`Auth mode: key query-param. Hosts tried: ${hosts.join(", ")}\n`);

// 1) List Accounts once (verifies the key works on the Account Mgmt API at all).
for (const host of hosts) {
  const r = await getJson(`${host}/api/account/list?key=${encodeURIComponent(API_KEY)}`);
  console.log(`LIST @ ${host}/api/account/list -> HTTP ${r.status} ${r.isJson ? "(JSON)" : "(non-JSON): " + r.json}`);
  if (r.isJson) {
    const arr = Array.isArray(r.json) ? r.json : (r.json.data ?? r.json.Accounts ?? []);
    console.log(`  ${Array.isArray(arr) ? arr.length : "?"} accounts returned`);
  }
}
console.log("");

// 2) Account Details per id, using AccountId=<numeric realeflow id>.
for (const id of uniqueIds) {
  console.log(`=== AccountId ${id} ===`);
  let done = false;
  for (const host of hosts) {
    const url = `${host}/api/account?key=${encodeURIComponent(API_KEY)}&AccountId=${encodeURIComponent(id)}`;
    const r = await getJson(url);
    if (r.isJson && typeof r.json === "object") {
      console.log(`  @ ${host} -> HTTP ${r.status} (JSON)`);
      printAccount(id, r.json);
      done = true;
      break;
    }
    console.log(`  @ ${host} -> HTTP ${r.status} ${r.isJson ? "(JSON)" : "(non-JSON): " + r.json}`);
  }
  if (!done) console.log("  (no host returned JSON for this id)");
  console.log("");
}
console.log("Note: Premium lead types (PRE_FORECLOSURE / FORECLOSURE_ACTIVITY /");
console.log("RECENTLY_DELINQUENT) require SitePlanId 589 (RF Pro w/ Premium Leads).");
