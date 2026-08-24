# Vacancy sourcing — bug notes

**Status:** FIXED 2026-08-24. Both the ON CONFLICT batch failure and the missing
`sourcing_cursors` row are addressed in code + a migration. See "## FIX (2026-08-24)"
at the bottom. The rest of this file is the original diagnosis, kept for context.

**Original status:** DIAGNOSED, NOT FIXED. Deferred by request — the 3 demo counties
(Hillsborough / Pinellas / Pasco) already return vacancy/zombie leads, so this
is not demo-blocking. Surplus-leads testing takes priority first.

## What works right now
- The BETA-flag fix is DONE + pushed (commit `0e43bb32`): vacancy template no
  longer shows "Isn't Wired Yet / Launching Soon". That part is complete.
- Big counties that were swept BEFORE the bug window still have data and show
  "Covered" (25 FL counties verified for vacancy).

## The actual problem (confirmed from the live DB, 2026-08-20)
Runs like **Bradford** show "Not Covered" — this is NOT honest-empty, it's a
sweep failure. Diagnostics run in Supabase SQL editor:

- `source_coverage` for FL vacancy: **63 counties_with_row, 25 verified,
  38 failed, 0 verified_but_empty.**
- `distress_pulls` grouped by error (vacancy, status='error'): **39 counties,
  ALL with the same error:**
  > `ON CONFLICT DO UPDATE command cannot affect row a second time`
- Cron IS running (code_violation + tax_deed pulled 2026-08-19), so this is a
  CODE bug, not stalled infra.
- `sourcing_cursors` row for `realeflow-fl-counties` = **missing / no row** —
  worth re-checking; the resumable cursor may never have persisted.

## Why vacancy specifically
Postgres throws "cannot affect row a second time" when ONE upsert statement
touches the same conflict-target row twice. Vacancy uses
`leadTypes: {include: ["ZOMBIE_PROPERTY","VACANCY"]}` (two lead types), so the
RealeFlow /search response returns the same property under both types more
often → more in-batch duplicates than probate/tax (single lienType).

## Where it is NOT
- `ingestDistressRecords` (`src/lib/distress-feed.server.ts:522`) already
  JS-dedupes on `fips|record_type|doc_number` before the upsert
  (`onConflict: "fips,record_type,doc_number"`). So the primary
  `distress_records_dedupe` UNIQUE(fips,record_type,doc_number) is handled.
- `reconcileFilings` early-returns for vacancy (`CASE_RECORD_TYPES` doesn't
  include vacancy), so it's not the reconciler.
- `sync_data_backed_coverage()` is a plain INSERT (no ON CONFLICT) — not it.
- This bug is ALREADY flagged as a known "separate task" in
  `LOVABLE-PROMPT-fix-records-distress-fallback.md:111` and
  `LOVABLE-PROMPT-phoneless-property-leads.md:129` ("coverage-upsert ON CONFLICT
  bug and the missing sourcing_cursors row").

## Prime suspect (verify FIRST next session — do NOT fix blind)
A SECOND unique constraint on `distress_records` that the JS dedup does NOT key
on (e.g. a UNIQUE on `(fips, parcel_apn)`), OR an AFTER trigger on
`distress_records` doing its own `INSERT ... ON CONFLICT`. Two rows sharing that
key but different doc_number survive the JS dedup and then collide.

### Run these two ALONE (already saved in reports/bradford-vacancy-check.sql, §6):
```sql
-- 6a) every unique index/constraint on the table
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='distress_records';

-- 6b) every trigger on the table
SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='distress_records' AND NOT t.tgisinternal;
```

## Fix decision tree (after 6a/6b)
- 6a shows a 2nd UNIQUE (e.g. parcel_apn) → extend the JS dedup in
  `ingestDistressRecords` to also collapse on that key (keep last sighting).
- 6b shows an upsert-doing trigger → dedupe inside the trigger, or drop/replace
  it. Needs a migration.
- Either way: after the fix, re-run the sweep so the 39 failed counties (Bradford
  included) flip to verified. Manual trigger: hit
  `/api/public/hooks/tick-realeflow-sourcing` a few times, or let nightly cron
  (09:40 UTC `leadtrace-tick-realeflow-sourcing`) cycle. Also re-check whether
  `sourcing_cursors` row gets created (migration 20260818230610).


## FIX (2026-08-24)

Two changes, both safe and non-destructive (no legitimate lead is ever dropped).

### 1. The ON CONFLICT batch failure — `dedupeFeedRows()`
Root cause confirmed from schema: migrations declare only ONE unique constraint
on `distress_records` (`distress_records_dedupe` on fips,record_type,doc_number),
which the old JS dedup already handled. The batch still failed, so the colliding
key must be the **live** `(fips, parcel_apn)` index (schema drift not in the
migrations) — the "prime suspect" from the diagnosis above. Vacancy pulls two
lead types (`ZOMBIE_PROPERTY` + `VACANCY`); the same property comes back under
both with two different address hashes → two doc_numbers, one parcel_apn → the
old doc_number-only dedup let both through → one upsert statement touched the same
parcel row twice → Postgres killed the whole county batch.

Fix (in `src/lib/distress-feed.shared.ts`, used by `ingestDistressRecords`):
`dedupeFeedRows()` now collapses on BOTH shapes — first (fips,record_type,
doc_number), then (fips,record_type,parcel_apn) — keeping the last sighting.
Parcel-less rows pass through untouched. Pure + unit tested
(`distress-feed.shared.test.ts`, 6 tests).

Defence in depth: if any unanticipated duplicate shape still trips the same error
(e.g. a future constraint/trigger), `ingestDistressRecords` catches it and falls
back to per-row upserts, so one bad row can never sink a whole county again.

### 2. Missing `sourcing_cursors` row
Migration `20260824120000_seed_realeflow_sourcing_cursor.sql` seeds the
`realeflow-fl-counties` cursor row (`ON CONFLICT (key) DO NOTHING`, so a live,
already-advanced cursor is never rewound). `writeCursor()` still upserts it
lazily; this just guarantees it exists from the first tick.

### Validation done
- `vitest`: 6 new dedup tests green; full suite 279 passed / 1 pre-existing
  unrelated fail (`custom-fields.test.ts` mailing_address, documented earlier).
- `tsc --noEmit`: zero errors from the touched files (only the pre-existing
  `@lovable.dev/email-js` module-not-found noise remains).

### Still to do after deploy (data backfill — not code)
Re-run the sweep so the 39 previously-failed counties (Bradford included) flip
from failed → verified. Either hit `/api/public/hooks/tick-realeflow-sourcing`
a few times, or let the nightly cron cycle. Then re-run
`reports/bradford-vacancy-check.sql` §5 to confirm `failed` drops toward 0.

## Key files
- `src/lib/distress-feed.server.ts` — `ingestDistressRecords` (522), dedup (561),
  upsert (570), `reconcileFilings` (657), `CASE_RECORD_TYPES` (649).
- `src/lib/data-providers/realeflow-source.server.ts` — sweep loop (283+),
  `recordCoverage` (101), `readCursor`/`writeCursor` (34/45), cursor advance (369).
- `src/lib/data-providers/realeflow-source.shared.ts` — vacancy config (46),
  `sliceCounties` (101).
- Diagnostics: `reports/bradford-vacancy-check.sql`.

## Verdict for the record
UI is HONEST today (Bradford truthfully says "Not Covered", no fake data, no
credits spent) — the app-side task is fine. Making those counties actually
covered is this data/DB bug, to be fixed next session.
