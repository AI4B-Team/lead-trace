UPDATE public.cron_locks
   SET last_tick_at = now() - interval '2 days',
       locked_at = now() - interval '2 days'
 WHERE key = 'tick-distress-feed';

SELECT net.http_post(
  url := 'https://project--c17f89b5-abf1-402a-95e3-1ace02324806-dev.lovable.app/api/public/hooks/tick-distress-feed',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT secret FROM public.cron_credentials WHERE key = 'default')),
  body := '{}'::jsonb,
  timeout_milliseconds := 300000
);