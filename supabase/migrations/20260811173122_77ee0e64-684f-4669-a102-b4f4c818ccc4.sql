-- Proof counties. All four go in as 'unverified': the handler and column map
-- must be confirmed against the live clerk page before any row they produce is
-- shown to a customer.
INSERT INTO public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
VALUES
  ('Hillsborough', 'FL', 'tax_deed', 'realauction_tab', 'https://hillsborough.realtaxdeed.com/', '{}'::jsonb, 'weekly', 'unverified', 'Proof county. Handler + columnMap unconfirmed; run discovery before promoting to live.'),
  ('Pasco', 'FL', 'tax_deed', 'realauction_tab', 'https://pasco.realtaxdeed.com/', '{}'::jsonb, 'weekly', 'unverified', 'Proof county. Handler + columnMap unconfirmed; run discovery before promoting to live.'),
  ('Pinellas', 'FL', 'tax_deed', 'realauction_tab', 'https://pinellas.realtaxdeed.com/', '{}'::jsonb, 'weekly', 'unverified', 'Proof county. Handler + columnMap unconfirmed; run discovery before promoting to live.'),
  ('Polk', 'FL', 'tax_deed', 'realauction_tab', 'https://polk.realtaxdeed.com/', '{}'::jsonb, 'weekly', 'unverified', 'Proof county. Handler + columnMap unconfirmed; run discovery before promoting to live.')
ON CONFLICT DO NOTHING;

-- Preview now carries the confirmation, when one exists. A record with no
-- confirmation returns NULLs and stays labelled estimated in the UI.
DROP FUNCTION IF EXISTS public.distress_surplus_preview(text, text, integer);

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
  property_zip text,
  confirmed_amount numeric,
  confirmed_as_of timestamp with time zone,
  claim_deadline date,
  deadline_from_clerk boolean,
  claim_status text,
  variance_pct numeric,
  confirmation_source_url text,
  source_status text,
  source_consecutive_failures integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    d.doc_number,
    d.auction_date,
    d.surplus_amount,
    d.surplus_basis,
    d.sold_to,
    d.estimated,
    COALESCE(NULLIF(TRIM(d.company_entity), ''), CONCAT_WS(' ', NULLIF(TRIM(d.owner_first), ''), NULLIF(LEFT(NULLIF(TRIM(d.owner_last), ''), 1) || '.', '')), 'Owner') AS owner_masked,
    d.property_city,
    d.property_zip,
    c.confirmed_amount,
    c.confirmed_as_of,
    c.claim_deadline,
    c.deadline_from_clerk,
    c.claim_status,
    c.variance_pct,
    c.source_url,
    s.status,
    s.consecutive_failures
  FROM public.distress_records d
  LEFT JOIN public.surplus_confirmations c ON c.derived_record_id = d.id
  LEFT JOIN public.surplus_sources s ON s.id = c.source_id
  WHERE d.record_type = 'surplus_funds'
    AND LOWER(d.state) = LOWER(_state)
    AND LOWER(d.county) = LOWER(_county)
    AND d.surplus_amount IS NOT NULL
  ORDER BY d.auction_date DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 50)
$function$;

REVOKE ALL ON FUNCTION public.distress_surplus_preview(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distress_surplus_preview(text, text, integer) TO anon, authenticated, service_role;