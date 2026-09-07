// RealeFlow NATIONWIDE entitlement probe — can our account source leads in
// states beyond Florida?
//
// The sweep is currently FL-only by design (FL_COUNTY_FIPS). Before building
// multi-state support we must verify the account's TERRITORY entitlement:
// RealeFlow may gate data per state/plan, so a silent empty result or an
// explicit refusal tells us which states are actually available.
//
// Probes one large county per candidate state x one cheap lead type each
// (probate = lienTypes DECEASED_PROBATE, enabled on our plan), plus
// pre_foreclosure for the first state as a premium-type spot check.
//
// Read-only, ~1.5s between requests, creds from .env (never printed).
// Run: node scripts/realeflow-state-probe.mjs
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

// One populous county per candidate expansion state. FIPS are static census codes.
const STATES = [
  { state: "TX", county: "Harris (Houston)", fips: "48201" },
  { state: "GA", county: "Fulton (Atlanta)", fips: "13121" },
  { state: "CA", county: "Los Angeles", fips: "06037" },
  { state: "NC", county: "Mecklenburg (Charlotte)", fips: "37119" },
  { state: "AZ", county: "Maricopa (Phoenix)", fips: "04013" },
  { state: "OH", county: "Franklin (Columbus)", fips: "39049" },
  { state: "FL", county: "Hillsborough (control)", fips: "12057" },
];

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

console.log(`RealeFlow nationwide territory probe — account ${env.REALEFLOW_ACCOUNT_ID}\n`);

for (const s of STATES) {
  // Probate: cheapest enabled base type — a clean territory check.
  const body = {
    places: [{ state: s.state, fips: s.fips }],
    size: 3,
    lienTypes: ["DECEASED_PROBATE"],
  };
  const r = await search(body);
  const rows = r.json?.data ?? r.json?.results ?? [];
  const total = r.json?.total ?? r.json?.meta?.total ?? null;
  const ok = r.status === 200 && Array.isArray(rows) && rows.length > 0;
  console.log(
    `${ok ? "OK  " : "MISS"} ${s.state} ${s.county.padEnd(24)} probate http=${r.status} rows=${Array.isArray(rows) ? rows.length : "?"} total=${total ?? "?"}` +
      (!ok && r.json ? ` — ${JSON.stringify(r.json).slice(0, 160)}` : ""),
  );
  await sleep(1500);
}

// Premium spot check: pre_foreclosure in TX (is the premium entitlement
// state-scoped or account-wide?)
const premium = await search({
  places: [{ state: "TX", fips: "48201" }],
  size: 3,
  leadTypes: { include: ["PRE_FORECLOSURE"] },
});
const prows = premium.json?.data ?? premium.json?.results ?? [];
console.log(
  `\n${premium.status === 200 && prows.length ? "OK  " : "MISS"} TX Harris pre_foreclosure (premium) http=${premium.status} rows=${Array.isArray(prows) ? prows.length : "?"}` +
    (premium.json && !(premium.status === 200 && prows.length) ? ` — ${JSON.stringify(premium.json).slice(0, 160)}` : ""),
);

console.log("\nVerdict: OK = that state is sourceable on this account today.");
console.log("MISS http=200 rows=0 = reachable but empty (possible entitlement or no data).");
console.log("MISS http=400/403 = explicit territory/entitlement refusal — needs Tyler.");
