select cron.unschedule('leadtrace-tick-lists');

select cron.schedule(
  'leadtrace-tick-lists',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app/api/public/hooks/tick-jobs',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT secret FROM public.cron_credentials WHERE key='default')),
    body := '{}'::jsonb
  );
  $$
);