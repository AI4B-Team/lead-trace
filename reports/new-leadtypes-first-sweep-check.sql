-- ---------------------------------------------------------------------------
-- First-sweep verification: pre_foreclosure + tax_delinquent (enabled 2026-08-25)
-- Run in Supabase SQL editor after the nightly cron (09:40 UTC).
-- Expected: distress_pulls rows for the two new types with status='ok', and
-- distress_records rows whose doc_number starts with 'PFC-' / 'TXD-'.
-- ---------------------------------------------------------------------------

-- 0) Did the migration clear the stale entitlement-disable markers?
--    Expected: 0 rows. If rows remain, the sweep is still skipping the types.
SELECT platform, dataset_id, record_type, status, last_error
FROM public.data_sources
WHERE platform = 'realeflow'
  AND dataset_id IN ('entitlement:pre_foreclosure', 'entitlement:tax_delinquent');

-- 1) Sweep activity for the two new types (most recent first).
--    Expected: rows with status='ok' and records_found > 0 for the counties in
--    the current cursor slice (6 counties per tick).
SELECT county, record_type, status, records_found, records_added, error, started_at
FROM public.distress_pulls
WHERE record_type IN ('pre_foreclosure', 'tax_delinquent')
ORDER BY started_at DESC
LIMIT 40;

-- 2) Actual records landed, by type + county.
SELECT record_type, county, COUNT(*) AS rows, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
FROM public.distress_records
WHERE record_type IN ('pre_foreclosure', 'tax_delinquent')
GROUP BY record_type, county
ORDER BY record_type, rows DESC;

-- 3) Spot-check: sample rows with the derived doc_number prefixes.
SELECT record_type, doc_number, property_address, property_city, created_at
FROM public.distress_records
WHERE doc_number LIKE 'PFC-%' OR doc_number LIKE 'TXD-%'
ORDER BY created_at DESC
LIMIT 10;

-- 4) Where is the sweep cursor now? (Which counties got covered this tick.)
SELECT key, position, cycles, last_label, updated_at
FROM public.sourcing_cursors
WHERE key = 'realeflow-fl-counties';

-- 5) If (1) shows errors: is it an entitlement refusal (would mean RealeFlow
--    turned it back off) or an ordinary fault? Read the error text.
SELECT record_type, error, COUNT(*) AS times, MAX(started_at) AS latest
FROM public.distress_pulls
WHERE record_type IN ('pre_foreclosure', 'tax_delinquent')
  AND status = 'error'
GROUP BY record_type, error
ORDER BY latest DESC;
