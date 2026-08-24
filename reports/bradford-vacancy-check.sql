-- ============================================================================
-- Bradford (FIPS 12007 / fl-bradford) — Vacancy coverage & data diagnostic
-- Run in Supabase SQL Editor. Read-only. Answers: is "Not Covered" honest,
-- or did the sweep fail / never reach Bradford×vacancy?
-- Note: source_coverage.fips is numeric ("12007"); distress_records.fips is
-- the slug ("fl-bradford"). We check both spellings everywhere.
-- ============================================================================

-- 1) Is there a source_coverage row for Bradford + vacancy, and what status?
--    No row  -> sweep never finished Bradford×vacancy   => "Not Covered" (gap)
--    verified + sample_row_count 0 -> swept, genuinely empty (should show "covered but empty")
--    failed  -> the API call errored (needs a re-run)
SELECT 'coverage' AS section, fips, county_name, record_type, status,
       sample_row_count, verified_at, last_success_at
FROM public.source_coverage
WHERE record_type = 'vacancy'
  AND (fips IN ('12007', 'fl-bradford') OR county_name ILIKE 'Bradford');

-- 2) Are there any actual vacancy rows in the feed for Bradford?
--    0 -> no data (small rural county; honest empty)
SELECT 'records' AS section, count(*) AS vacancy_rows,
       max(pulled_date) AS latest_pulled
FROM public.distress_records
WHERE record_type = 'vacancy'
  AND (fips IN ('12007', 'fl-bradford') OR county ILIKE 'Bradford');

-- 3) What did the last sweep attempts for Bradford×vacancy actually do?
--    Shows status ok/error, rows found/added, and any error text.
SELECT 'pulls' AS section, fips, county, record_type, status,
       records_found, records_added, error, started_at, finished_at
FROM public.distress_pulls
WHERE record_type = 'vacancy'
  AND (fips IN ('12007', 'fl-bradford') OR county ILIKE 'Bradford')
ORDER BY finished_at DESC NULLS LAST
LIMIT 10;

-- 4) Sanity baseline: same three checks for a county you KNOW works
--    (Hillsborough) so you can compare a healthy row against Bradford.
SELECT 'coverage_hillsborough' AS section, fips, county_name, record_type,
       status, sample_row_count, verified_at
FROM public.source_coverage
WHERE record_type = 'vacancy'
  AND (fips IN ('12057', 'fl-hillsborough') OR county_name ILIKE 'Hillsborough');

SELECT 'records_hillsborough' AS section, count(*) AS vacancy_rows
FROM public.distress_records
WHERE record_type = 'vacancy'
  AND (fips IN ('12057', 'fl-hillsborough') OR county ILIKE 'Hillsborough');

-- 4b) WHY are the vacancy counties failing? source_coverage has NO error
--     column (recordCoverage only writes status/verified_at/sample_row_count),
--     so the error text lives in distress_pulls.error. Group by it to see if
--     it's one systematic cause (rate-limit, timeout, WAF) or many.
SELECT error, count(*) AS counties
FROM public.distress_pulls
WHERE record_type = 'vacancy' AND status = 'error'
GROUP BY error
ORDER BY counties DESC;

-- 4b2) Is the WHOLE nightly sweep stalled? Last successful pull per record
--      type. If every last_pull is 2026-08-18 or older, the cron is not firing
--      (the missing sourcing_cursors row confirms the resumable path never ran).
SELECT record_type, max(finished_at) AS last_pull, count(*) AS total_pulls
FROM public.distress_pulls
GROUP BY record_type
ORDER BY last_pull DESC;

-- 4c) The most recent vacancy pull attempts across ALL counties, with error
--     text and row counts — the ground truth of what the sweep is doing.
SELECT county, fips, status, records_found, records_added, error,
       started_at, finished_at
FROM public.distress_pulls
WHERE record_type = 'vacancy'
ORDER BY finished_at DESC NULLS LAST
LIMIT 25;

-- 4d) Is the nightly cron even running? Show the cursor's last position and
--     when it last advanced. If updated_at is days old, the cron is stalled.
SELECT key, position, cycles, last_label, updated_at
FROM public.sourcing_cursors
WHERE key = 'realeflow-fl-counties';

-- 6) ROOT CAUSE PINPOINT: the "ON CONFLICT cannot affect row a second time"
--    error means one upsert statement hit the same conflict-target row twice.
--    Show every unique constraint AND every trigger on distress_records so we
--    know exactly which target / trigger is firing before writing a fix.
--    Run each of 6a / 6b ALONE.

-- 6a) All unique indexes/constraints on distress_records.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'distress_records';

-- 6b) All triggers on distress_records (an AFTER trigger doing its own upsert
--     is a classic cause of this exact error).
SELECT tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'distress_records' AND NOT t.tgisinternal;

-- 5) Bird's-eye: how many FL counties have ANY verified vacancy coverage,
--    and how many of those are empty vs. populated. Tells you if Bradford is
--    a lone gap or part of a big un-swept tail.
SELECT 'vacancy_coverage_summary' AS section,
       count(*)                                        AS counties_with_row,
       count(*) FILTER (WHERE status = 'verified')     AS verified,
       count(*) FILTER (WHERE status = 'failed')       AS failed,
       count(*) FILTER (WHERE status = 'verified'
                         AND coalesce(sample_row_count,0) = 0) AS verified_but_empty
FROM public.source_coverage
WHERE record_type = 'vacancy' AND state = 'FL';
