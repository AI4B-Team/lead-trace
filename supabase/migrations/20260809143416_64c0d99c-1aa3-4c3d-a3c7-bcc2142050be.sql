SELECT cron.unschedule('leadtrace-tick-compliance-digest')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leadtrace-tick-compliance-digest');

SELECT cron.schedule(
  'leadtrace-tick-compliance-digest',
  '15 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app/api/public/hooks/tick-compliance-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_credentials WHERE key = 'default')
    ),
    body := '{}'::jsonb
  );
  $$
);