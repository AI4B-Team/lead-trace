// RealElite/RealeFlow Account Management API — add a Partner AddOn to an account.
//
// PURPOSE: last self-serve attempt to enable the three premium distress lead
// types (PRE_FORECLOSURE / FORECLOSURE_ACTIVITY / RECENTLY_DELINQUENT) on our
// production account 192423 by enabling the "Leadpipes Premium" AddOn via the
// Partner "Add Partner AddOn" endpoint — separate from the site-plan change we
// already did (SitePlan 430 -> 589 turned HasPremiumLeads=true but the three
// types are still refused at the Property Data API).
//
// Endpoint (Partner API "Add Partner AddOn"):
//   POST {HOST}/api/account/addon?key={KEY}
//   Content-Type: application/x-www-form-urlencoded
//   body: AccountId=<realeflowId>&AddOnName=<name>[&BillingFrequency=<freq>]
//   Response JSON: { "Success": true }
// AddOnName is REQUIRED. Available AddOns include "Leadpipes Premium",
// "Leadpipes AI", "Liens", the Residential/Commercial lead bundles, etc.
// (Realeflow docs note: the AddOn must be available for YOUR api key, so this
//  can still be refused vendor-side even with a correct call.)
//
// !!! STATE-CHANGING / POSSIBLE BILLING IMPACT !!!
// Guarded three ways, exactly like realeflow-set-plan.mjs:
//   1. Refuses to run the POST unless CONFIRM=YES is set.
//   2. First READs account details AND probes the 3 premium types (baseline).
//   3. RE-READs account details AND re-probes the 3 types after the POST, so we
//      confirm the real Property Data API entitlement, not just a plan flag.
//
// Auth is the key QUERY PARAM for the Account Mgmt endpoints (key=<GUID>) and
// the X-RF-Partner-Api-Key HEADER for the leadpipes probe. Same GUID key.
// Host that works for us: https://app.realelite.com
//
// Usage (dry read + baseline probe only):
//   node scripts/realeflow-add-addon.mjs
// Usage (perform change):
//   CONFIRM=YES node scripts/realeflow-add-addon.mjs
// Override target/addon/billing:
//   ACCOUNT_ID=192423 ADDON_NAME="Leadpipes Premium" BILLING_FREQUENCY=MONTHLY CONFIRM=YES \
//     node scripts/realeflow-add-addon.mjs
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

const HOST = (process.env.HOST ?? env.REALEFLOW_BASE_URL ?? "https://app.realelite.com").replace(/\/+$/, "");
const API_KEY = env.REALEFLOW_API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID ?? "192423";
const ADDON_NAME = process.env.ADDON_NAME ?? "Leadpipes Premium";
const BILLING_FREQUENCY = process.env.BILLING_FREQUENCY ?? ""; // optional: MONTHLY | ANNUAL | THREE_MONTH | SIX_MONTH
const FIPS = Number(process.env.FIPS ?? "12057"); // Hillsborough, FL — for the probe
const CONFIRM = process.env.CONFIRM === "YES";

if (!API_KEY) {
  console.error("Missing REALEFLOW_API_KEY in .env");
  process.exit(1);
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!GUID_RE.test(API_KEY)) {
  console.warn(
    `WARNING: REALEFLOW_API_KEY is not GUID-format (len ${API_KEY.length}). ` +
      `The Partner API will reject it. Use the GUID Partner key, not the in-app key.\n`,
  );
}

const GET_HEADERS = {
  Accept: "application/json",
  "User-Agent": "LeadTrace-Integration/1.0 (+github.com/realelite)",
};
const FORM_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "LeadTrace-Integration/1.0 (+github.com/realelite)",
};
const PARTNER_HEADERS = {
  "X-RF-Partner-Api-Key": API_KEY,
  "X-RF-Partner-Account-Id": ACCOUNT_ID,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "LeadTrace-Integration/1.0 (+github.com/realelite)",
};

async function call(method, url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: opts.form ? FORM_HEADERS : GET_HEADERS,
      body: opts.form ?? undefined,
    });
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
    json = text.slice(0, 200).replace(/\s+/g, " ");
  }
  return { status: res.status, json, isJson };
}

async function readAccount() {
  const url = `${HOST}/api/account?key=${encodeURIComponent(API_KEY)}&AccountId=${encodeURIComponent(ACCOUNT_ID)}`;
  const r = await call("GET", url);
  if (r.isJson && typeof r.json === "object") {
    const j = r.json;
    return { ok: true, planId: j.SitePlanId, planName: j.SitePlanName, premium: j.HasPremiumLeads, raw: j };
  }
  return { ok: false, status: r.status, body: r.json };
}


// Probe the 3 premium distress types (plus FORECLOSURE as a known-good control)
// against the Property Data API. This is the REAL entitlement check.
const PREMIUM_TYPES = ["PRE_FORECLOSURE", "FORECLOSURE_ACTIVITY", "RECENTLY_DELINQUENT"];
async function probeTypes(label) {
  console.log(`\n${label} — probing premium lead types on /leadpipes/search (account ${ACCOUNT_ID}):`);
  for (const t of [...PREMIUM_TYPES, "FORECLOSURE"]) {
    let res;
    try {
      res = await fetch(`${HOST}/api/2.0/leadpipes/search`, {
        method: "POST",
        headers: PARTNER_HEADERS,
        body: JSON.stringify({ places: [{ state: "FL", fips: FIPS }], size: 1, leadTypes: { include: [t] } }),
      });
    } catch (e) {
      console.log(`  ${t}: fetch failed ${e.cause?.code ?? e.message}`);
      continue;
    }
    let j = null;
    try {
      j = await res.json();
    } catch {
      /* ignore */
    }
    const msg = j?.Message ?? j?.message ?? "";
    const rows = j?.data ?? j?.results ?? [];
    console.log(`  ${t}: http=${res.status} rows=${Array.isArray(rows) ? rows.length : "?"} ${msg}`);
  }
}

console.log(`Add Partner AddOn — AccountId ${ACCOUNT_ID}, AddOnName "${ADDON_NAME}"` +
  `${BILLING_FREQUENCY ? `, BillingFrequency ${BILLING_FREQUENCY}` : ""}  (host ${HOST})\n`);

// 1. READ current account state.
const before = await readAccount();
if (!before.ok) {
  console.error(`READ failed (HTTP ${before.status}): ${before.body}`);
  process.exit(1);
}
console.log(`BEFORE: SitePlanId=${before.planId}  "${before.planName}"  HasPremiumLeads=${before.premium}`);

// 2. Baseline probe of the 3 premium types.
await probeTypes("BEFORE");

if (!CONFIRM) {
  console.log(
    `\nDRY RUN — no AddOn added. This POST may have billing impact.\n` +
      `To actually add the AddOn, re-run with:\n` +
      `  CONFIRM=YES node scripts/realeflow-add-addon.mjs`,
  );
  process.exit(0);
}

// 3. POST the AddOn.
const addonUrl = `${HOST}/api/account/addon?key=${encodeURIComponent(API_KEY)}`;
const params = { AccountId: String(ACCOUNT_ID), AddOnName: ADDON_NAME };
if (BILLING_FREQUENCY) params.BillingFrequency = BILLING_FREQUENCY;
const form = new URLSearchParams(params).toString();
console.log(`\nPOST ${addonUrl.replace(API_KEY, "<KEY>")}\nbody: ${form}`);
const post = await call("POST", addonUrl, { form });
console.log(`POST -> HTTP ${post.status} ${post.isJson ? JSON.stringify(post.json) : "(" + post.json + ")"}`);
const success = post.isJson && (post.json.Success === true || post.json.success === true);
console.log(success ? "✅ AddOn call reported Success." : "⚠️ AddOn call did NOT report Success — check response above.");

// 4. RE-READ + re-probe to confirm the REAL entitlement change.
const after = await readAccount();
if (after.ok) {
  console.log(`\nAFTER: SitePlanId=${after.planId}  "${after.planName}"  HasPremiumLeads=${after.premium}`);
} else {
  console.log(`\nRE-READ failed (HTTP ${after.status}): ${after.body}`);
}
await probeTypes("AFTER");

console.log(
  `\nIf the 3 premium types now return http=200, flip enabled:false -> true for` +
    `\n  pre_foreclosure + tax_delinquent in src/lib/data-providers/realeflow-source.shared.ts.` +
    `\nIf they still return 400, this AddOn is not available for our API key — email Tyler` +
    `\n(TYLER-EMAIL-entitlements.md).`,
);
