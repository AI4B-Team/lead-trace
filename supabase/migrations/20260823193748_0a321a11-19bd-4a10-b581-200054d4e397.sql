CREATE TABLE public.marketplace_listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  search_id uuid REFERENCES public.marketplace_searches(id) ON DELETE SET NULL,
  source text NOT NULL,
  external_id text,
  listing_url text NOT NULL,
  title text NOT NULL,
  description text,
  price numeric,
  currency text NOT NULL DEFAULT 'USD',
  category text,
  location_text text,
  distance_miles numeric,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  photos text[] NOT NULL DEFAULT '{}'::text[],
  seller jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_score integer NOT NULL DEFAULT 0,
  match_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  posted_at timestamptz,
  posted_at_reliable boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  duplicate_group text,
  duplicate_confidence numeric,
  dismissed_at timestamptz,
  saved_lead_id uuid,
  saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX marketplace_listings_source_uniq
  ON public.marketplace_listings (workspace_id, source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX marketplace_listings_feed_idx
  ON public.marketplace_listings (workspace_id, dismissed_at, first_seen_at DESC);
CREATE INDEX marketplace_listings_search_idx
  ON public.marketplace_listings (search_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members manage marketplace listings"
  ON public.marketplace_listings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = marketplace_listings.workspace_id AND m.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = marketplace_listings.workspace_id AND m.user_id = auth.uid()
  ));

CREATE TRIGGER marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();