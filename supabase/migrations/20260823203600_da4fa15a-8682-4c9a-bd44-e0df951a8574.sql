ALTER TABLE public.marketplace_source_runs
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_job_id text,
  ADD COLUMN IF NOT EXISTS provider_requests integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_records integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filtered_out integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_calls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_category text;

CREATE INDEX IF NOT EXISTS marketplace_source_runs_provider_idx
  ON public.marketplace_source_runs (provider, started_at DESC);

ALTER TABLE public.marketplace_searches
  ADD COLUMN IF NOT EXISTS quiet_checks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_interval_seconds integer;