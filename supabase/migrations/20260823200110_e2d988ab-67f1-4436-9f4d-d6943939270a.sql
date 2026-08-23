-- Comparable Listings: cached comp runs. Comps are evidence, so every run
-- stores the actual supporting listings it used alongside the summary.
CREATE TABLE public.marketplace_comp_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  category text NOT NULL,
  subject jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  comps jsonb NOT NULL DEFAULT '[]'::jsonb,
  comps_found integer NOT NULL DEFAULT 0,
  usable_count integer NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'low',
  comp_sources text[] NOT NULL DEFAULT '{}'::text[],
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '3 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX marketplace_comp_runs_cache_uniq
  ON public.marketplace_comp_runs (workspace_id, cache_key);
CREATE INDEX marketplace_comp_runs_listing_idx
  ON public.marketplace_comp_runs (listing_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_comp_runs TO authenticated;
GRANT ALL ON public.marketplace_comp_runs TO service_role;

ALTER TABLE public.marketplace_comp_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members manage marketplace comp runs"
  ON public.marketplace_comp_runs FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = marketplace_comp_runs.workspace_id AND m.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = marketplace_comp_runs.workspace_id AND m.user_id = auth.uid()
  ));

CREATE TRIGGER marketplace_comp_runs_updated_at
  BEFORE UPDATE ON public.marketplace_comp_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS comp_count integer,
  ADD COLUMN IF NOT EXISTS comp_confidence text,
  ADD COLUMN IF NOT EXISTS comp_summary jsonb,
  ADD COLUMN IF NOT EXISTS comps_checked_at timestamptz;