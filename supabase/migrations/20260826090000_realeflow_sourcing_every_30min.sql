-- The RealeFlow sourcing tick is killed by the host at ~25-30s (observed
-- 2026-08-25/26: each nightly run finished probate × 6 counties and died before
-- the end-of-run cursor write, so the sweep restarted at county #1 every night
-- and tax_lien / vacancy / pre_foreclosure / tax_delinquent never ran at all).
-- The sweep is now county-outer with a per-county cursor checkpoint and a 15s
-- time budget, which means one tick completes roughly ONE county (all enabled
-- types). A nightly cadence would take 67 nights per cycle, so run the tick
-- every 30 minutes instead: ~48 counties/day, a full 67-county cycle in ~1.5
-- days. The route's overlap guard is 20 minutes (< the 30-min cadence).
SELECT cron.unschedule('leadtrace-tick-realeflow-sourcing')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leadtrace-tick-realeflow-sourcing');

SELECT cron.schedule(
  'leadtrace-tick-realeflow-sourcing',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app/api/public/hooks/tick-realeflow-sourcing',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT secret FROM public.cron_credentials WHERE key = 'default')),
    body := '{}'::jsonb
  );
  $$
);
