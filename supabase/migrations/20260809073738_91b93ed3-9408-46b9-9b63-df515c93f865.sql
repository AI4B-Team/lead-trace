ALTER TABLE public.cron_locks
  ADD COLUMN IF NOT EXISTS last_status text,
  ADD COLUMN IF NOT EXISTS last_detail text,
  ADD COLUMN IF NOT EXISTS last_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_duration_ms integer,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

GRANT ALL ON public.cron_locks TO service_role;