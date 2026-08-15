-- Clerk-primary surplus lists refresh weekly; give them their own schedule so
-- they no longer wait behind the 12-hour nightly Distress Feed lock.
SELECT cron.unschedule('tick-clerk-surplus') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tick-clerk-surplus');

SELECT cron.schedule(
  'tick-clerk-surplus',
  '35 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app/api/public/hooks/tick-clerk-surplus',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_credentials WHERE key = 'default')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Refresh surplus coverage row counts from what actually landed.
UPDATE public.source_coverage sc
SET sample_row_count = agg.rows,
    last_success_at = now(),
    status = 'verified',
    updated_at = now()
FROM (
  SELECT county_fips, county_name, state_code, count(*) AS rows
  FROM public.surplus_records_public
  GROUP BY 1,2,3
) agg
WHERE sc.record_type = 'surplus_funds'
  AND sc.state = agg.state_code
  AND lower(sc.county_name) = lower(agg.county_name);