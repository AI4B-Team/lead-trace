-- ============================================================================
-- All three links in ONE result grid (the SQL editor only renders the LAST
-- SELECT of a multi-statement batch, so UNION them). Read top-to-bottom:
--   §2 with_surplus_amount = 0  -> surplus never reached the leads table
--       (no surplus/records job was run, or the phoneless gate dropped them).
--       Not a migration bug: run a surplus job, the trigger backfills the rest.
--   §2 > 0 but §3 with_surplus_amount = 0 -> rollup/backfill gap (code bug).
-- ============================================================================
SELECT 1 AS ord, '1_distress_records' AS section,
       count(*)::text AS total,
       count(*) FILTER (WHERE surplus_amount IS NOT NULL)::text AS with_surplus_amount,
       count(*) FILTER (WHERE auction_date IS NOT NULL)::text   AS with_sale_or_auction,
       ''::text AS extra
FROM public.distress_records
WHERE record_type = 'surplus_funds'
UNION ALL
SELECT 2, '2_leads',
       count(*)::text,
       count(*) FILTER (WHERE source_meta ? 'surplus_amount')::text,
       count(*) FILTER (WHERE source_meta ? 'auction_date' OR source_meta ? 'sale_date')::text,
       count(*) FILTER (WHERE lower(coalesce(source_meta->>'record_type','')) LIKE '%surplus%')::text
FROM public.leads
UNION ALL
SELECT 3, '3_lead_records',
       count(*)::text,
       count(*) FILTER (WHERE source_meta ? 'surplus_amount')::text,
       count(*) FILTER (WHERE source_meta ? 'auction_date' OR source_meta ? 'sale_date')::text,
       count(*) FILTER (WHERE source_meta <> '{}'::jsonb)::text
FROM public.lead_records
ORDER BY ord;

-- ============================================================================
-- (Older per-section version kept below for reference.)
-- ============================================================================

-- Run in Lovable Cloud SQL editor. READ-ONLY. Each section counts one link in
-- the chain, so the empty link is obvious:
--
--   distress_records (source of truth)
--        -> a user runs a "records"/"surplus" job
--        -> records adapter's distress fallback maps rows via distressRowToLead
--        -> INSERT INTO leads (source_meta carries surplus_amount, auction_date…)
--        -> rollup_lead_record() trigger writes lead_records.source_meta
--        -> Leads UI reads lead_records
--
-- If section 1 has rows but section 2 is 0  -> no surplus job was ever run (or the
--   phoneless gate dropped them). Data problem, not a migration bug.
-- If section 2 has rows but section 3 is 0  -> the rollup/backfill did not persist
--   the meta (migration bug) -> re-run the backfill UPDATE.
-- ============================================================================

-- 1) The source of truth. How many surplus rows exist at all?
SELECT '1_distress_records' AS section,
       count(*)                                                AS surplus_rows,
       count(*) FILTER (WHERE surplus_amount IS NOT NULL)      AS with_amount,
       count(*) FILTER (WHERE auction_date  IS NOT NULL)       AS with_auction_date
FROM public.distress_records
WHERE record_type = 'surplus_funds';

-- 2) Did any surplus row ever flow into the raw leads table?
SELECT '2_leads' AS section,
       count(*)                                                        AS total_leads,
       count(*) FILTER (WHERE source_meta ? 'surplus_amount')          AS with_surplus_amount,
       count(*) FILTER (WHERE lower(coalesce(source_meta->>'record_type','')) LIKE '%surplus%')
                                                                       AS record_type_surplus,
       count(*) FILTER (WHERE source_meta ? 'auction_date')            AS with_auction_date
FROM public.leads;

-- 3) Did the rollup/backfill land it on the deduplicated master?
SELECT '3_lead_records' AS section,
       count(*)                                                        AS total_records,
       count(*) FILTER (WHERE source_meta <> '{}'::jsonb)              AS with_any_meta,
       count(*) FILTER (WHERE source_meta ? 'surplus_amount')          AS with_surplus_amount,
       count(*) FILTER (WHERE source_meta ? 'sale_date'
                          OR source_meta ? 'auction_date')             AS with_sale_date,
       count(*) FILTER (WHERE source_meta ? 'escheat_date')            AS with_escheat_date,
       count(*) FILTER (WHERE 'surplus_funds' = ANY(record_types))     AS record_type_surplus
FROM public.lead_records;

-- 4) If section 3 shows any surplus meta, sample it (this is what the verify
--    query looked for). Empty here but present in section 2 = backfill gap.
SELECT '4_sample' AS section, record_types,
       source_meta->>'surplus_amount' AS surplus,
       source_meta->>'sale_date'      AS sale_date,
       source_meta->>'auction_date'   AS auction_date,
       source_meta->>'escheat_date'   AS escheat,
       source_meta->>'county'         AS county,
       source_meta->>'record_type'    AS record_type
FROM public.lead_records
WHERE source_meta ?| array['surplus_amount','auction_date','sale_date','escheat_date']
LIMIT 10;
