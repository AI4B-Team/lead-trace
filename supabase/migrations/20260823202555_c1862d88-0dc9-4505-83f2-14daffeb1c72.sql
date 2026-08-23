ALTER TABLE public.marketplace_searches
  ADD COLUMN IF NOT EXISTS lead_creation_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS auto_lead_min_score integer NOT NULL DEFAULT 85;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_searches_lead_creation_mode_check'
  ) THEN
    ALTER TABLE public.marketplace_searches
      ADD CONSTRAINT marketplace_searches_lead_creation_mode_check
      CHECK (lead_creation_mode IN ('manual', 'auto_above_score'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_searches_auto_lead_min_score_check'
  ) THEN
    ALTER TABLE public.marketplace_searches
      ADD CONSTRAINT marketplace_searches_auto_lead_min_score_check
      CHECK (auto_lead_min_score BETWEEN 1 AND 100);
  END IF;
END $$;

COMMENT ON COLUMN public.marketplace_searches.lead_creation_mode IS
  'manual = only when a person saves a match; auto_above_score = create a lead when match score reaches auto_lead_min_score. Opt-in only, never enabled by default.';

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS lead_created_automatically boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS marketplace_listings_saved_lead_idx
  ON public.marketplace_listings (workspace_id, saved_lead_id)
  WHERE saved_lead_id IS NOT NULL;