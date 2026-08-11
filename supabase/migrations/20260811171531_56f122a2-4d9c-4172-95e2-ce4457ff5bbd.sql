INSERT INTO public.record_types (name, slug, category, sort_order, active)
VALUES ('Surplus Funds / Excess Proceeds', 'surplus_funds', 'real_estate_distress', 70, true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, sort_order = EXCLUDED.sort_order, active = true;

ALTER TABLE public.distress_records
  ADD COLUMN IF NOT EXISTS surplus_amount numeric,
  ADD COLUMN IF NOT EXISTS surplus_basis text,
  ADD COLUMN IF NOT EXISTS sold_to text,
  ADD COLUMN IF NOT EXISTS estimated boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.distress_surplus_preview(_state text, _county text, _limit integer DEFAULT 10)
RETURNS TABLE(
  doc_number text,
  auction_date date,
  surplus_amount numeric,
  surplus_basis text,
  sold_to text,
  estimated boolean,
  owner_masked text,
  property_city text,
  property_zip text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.doc_number,
    d.auction_date,
    d.surplus_amount,
    d.surplus_basis,
    d.sold_to,
    d.estimated,
    COALESCE(NULLIF(TRIM(d.company_entity), ''), CONCAT_WS(' ', NULLIF(TRIM(d.owner_first), ''), NULLIF(LEFT(NULLIF(TRIM(d.owner_last), ''), 1) || '.', '')), 'Owner') AS owner_masked,
    d.property_city,
    d.property_zip
  FROM public.distress_records d
  WHERE d.record_type = 'surplus_funds'
    AND LOWER(d.state) = LOWER(_state)
    AND LOWER(d.county) = LOWER(_county)
    AND d.surplus_amount IS NOT NULL
  ORDER BY d.auction_date DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 50)
$$;

REVOKE ALL ON FUNCTION public.distress_surplus_preview(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distress_surplus_preview(text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distress_surplus_preview(text, text, integer) TO service_role;