-- ONE-SHOT verification for pre_foreclosure + tax_delinquent (single statement,
-- because the Lovable SQL editor only shows the LAST statement's result).
-- Every check comes back as one row set. Read the "check" column top-down.
SELECT * FROM (

  -- A) Stale entitlement markers. want = '0 rows expected'; any row here means
  --    the sweep is still SKIPPING the new types (migration didn't clear them).
  SELECT 'A stale-entitlement-marker' AS chk,
         dataset_id AS detail,
         status AS info,
         NULL::timestamptz AS at
  FROM public.data_sources
  WHERE platform = 'realeflow'
    AND dataset_id IN ('entitlement:pre_foreclosure', 'entitlement:tax_delinquent')

  UNION ALL

  -- B) Pull activity for the new types since yesterday (ok + error).
  SELECT 'B pull ' || record_type,
         county,
         status || ' found=' || records_found || ' added=' || records_added
           || COALESCE(' err=' || LEFT(error, 60), ''),
         started_at
  FROM public.distress_pulls
  WHERE record_type IN ('pre_foreclosure', 'tax_delinquent')

  UNION ALL

  -- C) Records landed, grouped per type+county.
  SELECT 'C records ' || record_type,
         county,
         COUNT(*) || ' rows',
         MAX(created_at)
  FROM public.distress_records
  WHERE record_type IN ('pre_foreclosure', 'tax_delinquent')
  GROUP BY record_type, county

  UNION ALL

  -- D) Sweep cursor position (which slice of the 67 counties ran last).
  SELECT 'D cursor',
         COALESCE(last_label, '(none)'),
         'position=' || position || ' cycles=' || cycles,
         updated_at
  FROM public.sourcing_cursors
  WHERE key = 'realeflow-fl-counties'

  UNION ALL

  -- E) Sanity: latest 3 pulls of ANY type, proving the cron itself ran tonight.
  (SELECT 'E latest-cron-activity',
          county || ' / ' || record_type,
          status || ' found=' || records_found,
          started_at
   FROM public.distress_pulls
   WHERE started_at > now() - interval '36 hours'
   ORDER BY started_at DESC
   LIMIT 3)

) checks
ORDER BY chk, at DESC NULLS LAST;

