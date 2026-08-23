ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS match_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attribute_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seller_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS market_position text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS market_position_note text,
  ADD COLUMN IF NOT EXISTS disqualified_reason text,
  ADD COLUMN IF NOT EXISTS analysis_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_analysis_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_listings_market_position_check'
  ) THEN
    ALTER TABLE public.marketplace_listings
      ADD CONSTRAINT marketplace_listings_market_position_check
      CHECK (market_position IN ('above', 'at', 'below', 'unknown'));
  END IF;
END $$;

ALTER TABLE public.marketplace_searches
  ADD COLUMN IF NOT EXISTS min_match_score integer NOT NULL DEFAULT 80;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_searches_min_match_score_check'
  ) THEN
    ALTER TABLE public.marketplace_searches
      ADD CONSTRAINT marketplace_searches_min_match_score_check
      CHECK (min_match_score BETWEEN 0 AND 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS marketplace_listings_score_idx
  ON public.marketplace_listings (workspace_id, match_score DESC, first_seen_at DESC);