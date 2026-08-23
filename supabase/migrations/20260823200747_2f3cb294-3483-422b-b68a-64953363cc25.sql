ALTER TABLE public.marketplace_searches
  ADD COLUMN IF NOT EXISTS check_interval_seconds integer NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS baseline_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS baseline_at timestamptz,
  ADD COLUMN IF NOT EXISTS baseline_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alert_existing_matches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_limited_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_alerted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_searches_baseline_state_check') THEN
    ALTER TABLE public.marketplace_searches
      ADD CONSTRAINT marketplace_searches_baseline_state_check
      CHECK (baseline_state IN ('pending', 'established'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_searches_interval_check') THEN
    ALTER TABLE public.marketplace_searches
      ADD CONSTRAINT marketplace_searches_interval_check
      CHECK (check_interval_seconds BETWEEN 60 AND 86400);
  END IF;
END $$;

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS source_listing_id text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS seen_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relisted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_baseline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_listings_enrichment_state_check') THEN
    ALTER TABLE public.marketplace_listings
      ADD CONSTRAINT marketplace_listings_enrichment_state_check
      CHECK (enrichment_state IN ('pending', 'running', 'done', 'skipped', 'error'));
  END IF;
END $$;

UPDATE public.marketplace_listings SET source_listing_id = external_id WHERE source_listing_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_identity_idx
  ON public.marketplace_listings (workspace_id, search_id, source, external_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_enrichment_idx
  ON public.marketplace_listings (enrichment_state, first_seen_at);
CREATE INDEX IF NOT EXISTS marketplace_searches_due_idx
  ON public.marketplace_searches (status, next_check_at);

CREATE TABLE IF NOT EXISTS public.marketplace_source_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES public.marketplace_searches(id) ON DELETE CASCADE,
  source text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  listings_seen integer NOT NULL DEFAULT 0,
  new_listings integer NOT NULL DEFAULT 0,
  qualified integer NOT NULL DEFAULT 0,
  alerted integer NOT NULL DEFAULT 0,
  baseline boolean NOT NULL DEFAULT false,
  rate_limited boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketplace_source_runs TO authenticated;
GRANT ALL ON public.marketplace_source_runs TO service_role;
ALTER TABLE public.marketplace_source_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'marketplace_source_runs'
      AND policyname = 'Members read their marketplace source runs'
  ) THEN
    CREATE POLICY "Members read their marketplace source runs"
      ON public.marketplace_source_runs FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = marketplace_source_runs.workspace_id
          AND m.user_id = auth.uid()
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS marketplace_source_runs_search_idx
  ON public.marketplace_source_runs (search_id, started_at DESC);