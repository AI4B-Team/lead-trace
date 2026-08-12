CREATE TABLE IF NOT EXISTS public.surplus_state_pages (
  state             text PRIMARY KEY,
  primary_term      text,
  term_aliases      text[] NOT NULL DEFAULT '{}',
  clerk_title       text,
  overview_md       text,
  owner_record_date text,
  notes             text,
  last_verified_at  date,
  published         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surplus_state_pages_state_len CHECK (char_length(state) = 2),
  CONSTRAINT surplus_state_pages_publishable CHECK (
    published = false
    OR (
      primary_term IS NOT NULL
      AND clerk_title IS NOT NULL
      AND overview_md IS NOT NULL
      AND char_length(overview_md) >= 400
      AND last_verified_at IS NOT NULL
    )
  )
);

COMMENT ON CONSTRAINT surplus_state_pages_publishable ON public.surplus_state_pages IS
  'A state cannot be published without authored overview prose and a verification date. Prevents thin templated pages from ever reaching the index.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.surplus_state_pages TO authenticated;
GRANT ALL ON public.surplus_state_pages TO service_role;
ALTER TABLE public.surplus_state_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "surplus_state_pages_admin" ON public.surplus_state_pages
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER surplus_state_pages_updated_at
  BEFORE UPDATE ON public.surplus_state_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.surplus_county_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state               text NOT NULL,
  county_fips         text NOT NULL UNIQUE,
  county_name         text NOT NULL,
  slug                text NOT NULL,
  clerk_office_name   text,
  clerk_address_line1 text,
  clerk_address_line2 text,
  clerk_city          text,
  clerk_postal_code   text,
  clerk_phone         text,
  official_list_url   text,
  claim_process_md    text,
  latitude            numeric(9,6),
  longitude           numeric(9,6),
  verified_at         date,
  published           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surplus_county_pages_state_slug_key UNIQUE (state, slug),
  CONSTRAINT surplus_county_pages_publishable CHECK (
    published = false
    OR (
      clerk_office_name IS NOT NULL
      AND official_list_url IS NOT NULL
      AND verified_at IS NOT NULL
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.surplus_county_pages TO authenticated;
GRANT ALL ON public.surplus_county_pages TO service_role;
ALTER TABLE public.surplus_county_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "surplus_county_pages_admin" ON public.surplus_county_pages
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER surplus_county_pages_updated_at
  BEFORE UPDATE ON public.surplus_county_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.surplus_faqs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state       text NOT NULL,
  county_fips text,
  question    text NOT NULL,
  answer_md   text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS surplus_faqs_lookup_idx
  ON public.surplus_faqs (state, county_fips, sort_order)
  WHERE published = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.surplus_faqs TO authenticated;
GRANT ALL ON public.surplus_faqs TO service_role;
ALTER TABLE public.surplus_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "surplus_faqs_admin" ON public.surplus_faqs
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER surplus_faqs_updated_at
  BEFORE UPDATE ON public.surplus_faqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.surplus_records_public AS
SELECT DISTINCT ON (
  r.fips,
  COALESCE(r.doc_number, r.parcel_apn, r.property_address),
  r.auction_date
)
  r.id,
  r.fips                                   AS county_fips,
  cp.slug                                  AS county_slug,
  cp.county_name,
  r.state                                  AS state_code,
  CASE WHEN r.surplus_basis = 'opening_bid' THEN 'tax_deed'
       ELSE 'mortgage_foreclosure' END     AS sale_type,
  c.confirmed_amount                       AS surplus_amount,
  r.auction_date                           AS sale_date,
  CASE WHEN s.escheat_days IS NULL OR r.auction_date IS NULL THEN NULL
       ELSE r.auction_date + s.escheat_days END AS escheat_date,
  r.created_at                             AS first_seen_at,
  c.confirmed_as_of                        AS confirmed_at,
  COALESCE(c.source_url, r.source_url)     AS source_url
FROM public.distress_records r
JOIN public.surplus_confirmations c
  ON c.derived_record_id = r.id AND c.confirmed_amount IS NOT NULL
JOIN public.surplus_state_pages sp
  ON sp.state = r.state AND sp.published = true
JOIN public.surplus_county_pages cp
  ON cp.county_fips = r.fips AND cp.published = true
LEFT JOIN public.surplus_statutes s
  ON s.state = r.state AND s.published = true
 AND s.sale_kind = CASE WHEN r.surplus_basis = 'opening_bid' THEN 'tax_deed' ELSE 'foreclosure' END
WHERE r.record_type = 'surplus_funds'
  AND COALESCE(c.claim_status, 'unknown') IN ('unclaimed', 'unknown')
ORDER BY
  r.fips,
  COALESCE(r.doc_number, r.parcel_apn, r.property_address),
  r.auction_date,
  c.confirmed_as_of DESC NULLS LAST;

COMMENT ON VIEW public.surplus_records_public IS
  'Deduped, clerk-confirmed, still-outstanding surplus records in published jurisdictions. Backs the public guide pages only.';

REVOKE ALL ON public.surplus_records_public FROM anon, authenticated;
GRANT SELECT ON public.surplus_records_public TO service_role;

CREATE OR REPLACE FUNCTION public.surplus_public_state_aggregate(p_state text)
RETURNS TABLE (
  total_amount  numeric,
  record_count  bigint,
  county_count  bigint,
  by_sale_type  jsonb,
  data_as_of    timestamptz,
  min_sale_date date,
  max_sale_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT * FROM public.surplus_records_public WHERE state_code = upper(p_state)
  ), t AS (
    SELECT jsonb_object_agg(sale_type, cnt) AS by_type
    FROM (SELECT sale_type, count(*) AS cnt FROM r GROUP BY sale_type) x
  )
  SELECT
    COALESCE((SELECT sum(surplus_amount) FROM r), 0),
    (SELECT count(*) FROM r),
    (SELECT count(DISTINCT county_fips) FROM r),
    COALESCE((SELECT by_type FROM t), '{}'::jsonb),
    (SELECT max(first_seen_at) FROM r),
    (SELECT min(sale_date) FROM r),
    (SELECT max(sale_date) FROM r);
$$;

CREATE OR REPLACE FUNCTION public.surplus_public_county_aggregate(p_county_fips text)
RETURNS TABLE (
  total_amount  numeric,
  record_count  bigint,
  by_sale_type  jsonb,
  data_as_of    timestamptz,
  min_sale_date date,
  max_sale_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT * FROM public.surplus_records_public WHERE county_fips = p_county_fips
  ), t AS (
    SELECT jsonb_object_agg(sale_type, cnt) AS by_type
    FROM (SELECT sale_type, count(*) AS cnt FROM r GROUP BY sale_type) x
  )
  SELECT
    COALESCE((SELECT sum(surplus_amount) FROM r), 0),
    (SELECT count(*) FROM r),
    COALESCE((SELECT by_type FROM t), '{}'::jsonb),
    (SELECT max(first_seen_at) FROM r),
    (SELECT min(sale_date) FROM r),
    (SELECT max(sale_date) FROM r);
$$;

CREATE OR REPLACE FUNCTION public.surplus_public_state_counties(p_state text)
RETURNS TABLE (
  county_fips       text,
  county_name       text,
  county_slug       text,
  clerk_office_name text,
  official_list_url text,
  record_count      bigint,
  total_amount      numeric,
  verified_at       date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cp.county_fips, cp.county_name, cp.slug, cp.clerk_office_name, cp.official_list_url,
         count(v.id), COALESCE(sum(v.surplus_amount), 0), cp.verified_at
  FROM public.surplus_county_pages cp
  JOIN public.surplus_records_public v ON v.county_fips = cp.county_fips
  WHERE cp.state = upper(p_state)
  GROUP BY cp.county_fips, cp.county_name, cp.slug, cp.clerk_office_name,
           cp.official_list_url, cp.verified_at
  HAVING count(v.id) > 0
  ORDER BY sum(v.surplus_amount) DESC;
$$;

CREATE OR REPLACE FUNCTION public.surplus_public_nearby_counties(p_county_fips text, p_limit int DEFAULT 3)
RETURNS TABLE (
  county_fips  text,
  county_name  text,
  county_slug  text,
  state_code   text,
  record_count bigint,
  total_amount numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH o AS (
    SELECT county_fips, state, latitude, longitude
    FROM public.surplus_county_pages WHERE county_fips = p_county_fips
  )
  SELECT cp.county_fips, cp.county_name, cp.slug, cp.state, count(v.id),
         COALESCE(sum(v.surplus_amount), 0)
  FROM public.surplus_county_pages cp
  JOIN public.surplus_records_public v ON v.county_fips = cp.county_fips
  CROSS JOIN o
  WHERE cp.county_fips <> o.county_fips AND cp.state = o.state
  GROUP BY cp.county_fips, cp.county_name, cp.slug, cp.state, cp.latitude, cp.longitude,
           o.latitude, o.longitude
  ORDER BY
    CASE
      WHEN o.latitude IS NULL OR cp.latitude IS NULL THEN NULL
      ELSE (cp.latitude - o.latitude) ^ 2
         + ((cp.longitude - o.longitude) * cos(radians(o.latitude))) ^ 2
    END ASC NULLS LAST,
    cp.county_name ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.surplus_public_urls()
RETURNS TABLE (state_code text, county_slug text, last_modified timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.state_code, NULL::text, max(v.first_seen_at)
  FROM public.surplus_records_public v
  GROUP BY v.state_code
  UNION ALL
  SELECT v.state_code, v.county_slug, max(v.first_seen_at)
  FROM public.surplus_records_public v
  WHERE v.county_slug IS NOT NULL
  GROUP BY v.state_code, v.county_slug;
$$;

REVOKE ALL ON FUNCTION public.surplus_public_state_aggregate(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.surplus_public_county_aggregate(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.surplus_public_state_counties(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.surplus_public_nearby_counties(text, int) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.surplus_public_urls() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.surplus_public_state_aggregate(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.surplus_public_county_aggregate(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.surplus_public_state_counties(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.surplus_public_nearby_counties(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.surplus_public_urls() TO service_role;