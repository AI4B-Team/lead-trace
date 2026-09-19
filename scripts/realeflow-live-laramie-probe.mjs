// One-shot probe: does the live-pull path (autocomplete → search) work for a
// roster-outside county (Laramie, WY)? Mirrors realeflow-live.server.ts logic.
// Usage: node scripts/realeflow-live-laramie-probe.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const BASE = (env.REALEFLOW_BASE_URL ?? "").replace(/\/+$/, "");
const KEY = env.REALEFLOW_API_KEY;
const ACCT = env.REALEFLOW_ACCOUNT_ID;
if (!BASE || !KEY || !ACCT) {
  console.error("Missing REALEFLOW_* env vars in .env");
  process.exit(1);
}

const HEADERS = {
  "X-RF-Partner-Api-Key": KEY,
  "X-RF-Partner-Account-Id": ACCT,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

async function call(method, path, { query, body } = {}) {
  let url = `${BASE}/api/2.0/leadpipes${path}`;
  if (query) url += `?${new URLSearchParams(query)}`;
  const res = await fetch(url, {
    method,
    headers: HEADERS,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const blocked = /Just a moment|challenges\.cloudflare\.com|cf-browser-verification/i.test(text);
  return { status: res.status, blocked, text };
}

// Step 1 — autocomplete resolve (the roster-outside path)
console.log("Step 1: autocomplete 'Laramie County, WY' ...");
const ac = await call("GET", "/autocomplete", { query: { q: "Laramie County, WY" } });
if (ac.blocked) {
  console.log(`  BLOCKED by bot protection (http=${ac.status})`);
  process.exit(0);
}
if (ac.status !== 200) {
  console.log(`  http=${ac.status} body=${ac.text.slice(0, 200)}`);
  process.exit(0);
}
const results = JSON.parse(ac.text);
const county = results.find(
  (r) => r.type === "county" && (r.county?.state ?? "").toUpperCase() === "WY",
);
if (!county) {
  console.log("  200 OK but no WY county match. Raw:", JSON.stringify(results).slice(0, 400));
  process.exit(0);
}
const fips = String(county.county.fips ?? "").padStart(5, "0");
console.log(`  OK -> ${county.county.county}, WY fips=${fips}`);

// Step 2 — probate search on the resolved FIPS
console.log("Step 2: search probate in that county ...");
const search = await call("POST", "/search", {
  body: {
    fips: [fips],
    state: ["WY"],
    lead_type: ["DECEASED_PROBATE"],
    page: 1,
    page_size: 20,
  },
});
if (search.blocked) {
  console.log(`  BLOCKED by bot protection (http=${search.status})`);
  process.exit(0);
}
if (search.status !== 200) {
  console.log(`  http=${search.status} body=${search.text.slice(0, 300)}`);
  process.exit(0);
}
const data = JSON.parse(search.text);
const rows = Array.isArray(data.data) ? data.data.length : 0;
console.log(`  OK http=200 rows=${rows}`);
console.log(
  rows > 0
    ? "\nVERDICT: live-pull path works end-to-end from this machine — production failure is IP/transient bot-protection, not the model."
    : "\nVERDICT: path works (200) but county returned 0 probate rows — resolution OK, data may genuinely be sparse in WY.",
);
