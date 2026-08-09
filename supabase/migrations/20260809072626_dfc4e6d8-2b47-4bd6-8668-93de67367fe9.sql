ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS plan_period_start timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS plan_grant_amount integer NOT NULL DEFAULT 0;

SELECT cron.schedule(
  'leadtrace-tick-plan-renewal',
  '20 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app/api/public/hooks/tick-plan-renewal',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT secret FROM public.cron_credentials WHERE key = 'default')),
    body := '{}'::jsonb
  );
  $$
);