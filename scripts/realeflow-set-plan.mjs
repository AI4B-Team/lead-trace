// RealElite/RealeFlow Account Management API — set an account's Site Plan.
//
// PURPOSE: move our production account 192423 (currently SitePlanId 430,
// "Team FREE") to SitePlanId 589 ("RF Pro + Premium Leads") so the premium
// distress lead types (PRE_FORECLOSURE / FORECLOSURE_ACTIVITY /
// RECENTLY_DELINQUENT) become available on the Partner Property Data API.
//
// !!! STATE-CHANGING / POSSIBLE BILLING IMPACT !!!
// This performs a PUT. It is guarded three ways:
//   1. It refuses to run unless CONFIRM=YES is set in the environment.
//   2. It first does a READ and prints the current plan.
//   3. It re-reads after the PUT and prints the new plan to confirm.
//
// Auth is the key QUERY PARAM (same as the read check), NOT a header.
// Host that works for us: https://app.realelite.com
//
// Usage (dry read only):   node scripts/realeflow-set-plan.mjs
// Usage (perform change):  CONFIRM=YES node scripts/realeflow-set-plan.mjs
// Override target/plan:     ACCOUNT_ID=192423 PLAN_ID=589 CONFIRM=YES node scripts/realeflow-set-plan.mjs
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

const HOST = (process.env.HOST ?? "https://app.realelite.com").replace(/\/+$/, "");
const API_KEY = env.REALEFLOW_API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID ?? "192423";
const PLAN_ID = Number(process.env.PLAN_ID ?? "589");
const CONFIRM = process.env.CONFIRM === "YES";

if (!API_KEY) {
  console.error("Missing REALEFLOW_API_KEY in .env");
  process.exit(1);
}

// GET reads use JSON accept. The PUT plan-update uses form-urlencoded per the
// Partner API Postman docs ("PUT Account Plan Update").
const GET_HEADERS = {
  Accept: "application/json",
  "User-Agent": "LeadTrace-Integration/1.0 (+github.com/realelite)",
};
const FORM_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/x-www-form-urlencoded",
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

console.log(`Target: AccountId ${ACCOUNT_ID} -> SitePlanId ${PLAN_ID}  (host ${HOST})\n`);

// 1. READ current plan.
const before = await readAccount();
if (!before.ok) {
  console.error(`READ failed (HTTP ${before.status}): ${before.body}`);
  process.exit(1);
}
console.log(`BEFORE: SitePlanId=${before.planId}  "${before.planName}"  HasPremiumLeads=${before.premium}`);

if (before.planId === PLAN_ID) {
  console.log(`\nAlready on plan ${PLAN_ID}. Nothing to do.`);
  process.exit(0);
}

if (!CONFIRM) {
  console.log(
    `\nDRY RUN — no change made. This PUT may have billing impact.\n` +
      `To actually set the plan, re-run with:  CONFIRM=YES node scripts/realeflow-set-plan.mjs`,
  );
  process.exit(0);
}

// 2. PUT the plan update.
// Exact spec from the Partner API Postman docs ("PUT Account Plan Update"):
//   PUT {HOST}/api/account/update/plan?key={KEY}
//   Content-Type: application/x-www-form-urlencoded
//   body: AccountId=<id>&SitePlanId=<plan>
// Response JSON: { FormerPlanId, NewPlanId, Notes, Success, AccountId, Error }
// NOTE: only works for pre-established upgrade/downgrade paths; otherwise the
// Realeflow dev team must add the 430->589 mapping for our org.
const putUrl = `${HOST}/api/account/update/plan?key=${encodeURIComponent(API_KEY)}`;
const form = new URLSearchParams({
  AccountId: String(ACCOUNT_ID),
  SitePlanId: String(PLAN_ID),
}).toString();
console.log(`\nPUT ${putUrl.replace(API_KEY, "<KEY>")}\nbody: ${form}`);
const put = await call("PUT", putUrl, { form });
console.log(`PUT -> HTTP ${put.status} ${put.isJson ? JSON.stringify(put.json) : "(" + put.json + ")"}`);

// 3. RE-READ to confirm.
const after = await readAccount();
if (after.ok) {
  console.log(`\nAFTER: SitePlanId=${after.planId}  "${after.planName}"  HasPremiumLeads=${after.premium}`);
  console.log(after.planId === PLAN_ID ? "✅ Plan change confirmed." : "⚠️ Plan did not change — check PUT spec/response.");
} else {
  console.log(`\nRE-READ failed (HTTP ${after.status}): ${after.body}`);
}
