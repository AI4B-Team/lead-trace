// Quick read-only check: did the nightly sweep pull the newly-enabled
// pre_foreclosure / tax_delinquent types? Reads Supabase REST with the
// publishable key from .env (RLS may hide tables from anon; a 401/permission
// result means "run reports/new-leadtypes-first-sweep-check.sql in the
// dashboard instead", not a sweep failure).
// Run: node scripts/check-new-leadtypes-sweep.mjs
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

const BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_PUBLISHABLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function q(label, path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  const text = await res.text();
  console.log(`\n== ${label} (http ${res.status}) ==`);
  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) return console.log(text.slice(0, 400));
    if (!rows.length) return console.log("(no rows)");
    for (const r of rows) console.log(JSON.stringify(r));
  } catch {
    console.log(text.slice(0, 400));
  }
}

await q(
  "distress_pulls — new types, latest 15",
  "distress_pulls?select=county,record_type,status,records_found,records_added,error,started_at&record_type=in.(pre_foreclosure,tax_delinquent)&order=started_at.desc&limit=15",
);
await q(
  "distress_records — counts by type",
  "distress_records?select=record_type,county&record_type=in.(pre_foreclosure,tax_delinquent)&limit=1000",
);
await q(
  "stale entitlement markers (expect none)",
  "data_sources?select=dataset_id,record_type,status&platform=eq.realeflow&dataset_id=in.(entitlement:pre_foreclosure,entitlement:tax_delinquent)",
);
await q(
  "sweep cursor",
  "sourcing_cursors?select=key,position,cycles,last_label,updated_at&key=eq.realeflow-fl-counties",
);
