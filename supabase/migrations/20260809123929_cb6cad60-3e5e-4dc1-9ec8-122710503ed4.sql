-- Platform-wide kill switch row for background agents.
INSERT INTO public.background_agents (workspace_id, agent_key, mode, enabled, interval_minutes)
VALUES (NULL, 'all', 'flag_only', true, 15)
ON CONFLICT DO NOTHING;

SELECT cron.unschedule('leadtrace-tick-agents')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leadtrace-tick-agents');

SELECT cron.schedule(
  'leadtrace-tick-agents',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app/api/public/hooks/tick-agents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM public.cron_credentials WHERE key = 'default')
    ),
    body := '{}'::jsonb
  );
  $$
);