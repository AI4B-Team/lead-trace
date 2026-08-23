ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.marketplace_listings.source_metadata IS
  'Raw source payload subset kept for provenance. Source-specific fields belong here or in attributes, never as new top-level columns.';