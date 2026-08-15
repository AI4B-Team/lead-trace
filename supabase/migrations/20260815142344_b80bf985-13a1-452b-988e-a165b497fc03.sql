-- The public surplus view only excluded claim_filed rows when a reconciliation
-- row existed. Clerk lists that mark a petition directly on the record (88 rows
-- today) were leaking into the public "unclaimed" totals, which contradicts what
-- the county guide pages tell claimants. Exclude them at the record level too.
CREATE OR REPLACE VIEW public.surplus_records_public
WITH (security_invoker = true) AS
 SELECT DISTINCT ON (r.fips, (COALESCE(r.doc_number, r.parcel_apn, r.property_address)), r.auction_date)
    r.id,
    r.fips AS county_fips,
    cp.slug AS county_slug,
    cp.county_name,
    r.state AS state_code,
    CASE
        WHEN r.surplus_basis = 'opening_bid'::text THEN 'tax_deed'::text
        ELSE 'mortgage_foreclosure'::text
    END AS sale_type,
    COALESCE(c.confirmed_amount, r.surplus_amount) AS surplus_amount,
    r.auction_date AS sale_date,
    CASE
        WHEN s.escheat_days IS NULL OR r.auction_date IS NULL THEN NULL::date
        ELSE r.auction_date + s.escheat_days
    END AS escheat_date,
    r.created_at AS first_seen_at,
    COALESCE(c.confirmed_as_of, r.updated_at) AS confirmed_at,
    COALESCE(c.source_url, r.source_url) AS source_url
   FROM distress_records r
     LEFT JOIN surplus_confirmations c ON c.derived_record_id = r.id AND c.confirmed_amount IS NOT NULL
     JOIN surplus_state_pages sp ON sp.state = r.state AND sp.published = true
     JOIN surplus_county_pages cp ON cp.county_fips = r.fips AND cp.published = true
     LEFT JOIN surplus_statutes s ON s.state = r.state AND s.published = true AND s.sale_kind =
        CASE
            WHEN r.surplus_basis = 'opening_bid'::text THEN 'tax_deed'::text
            ELSE 'foreclosure'::text
        END
  WHERE r.record_type = 'surplus_funds'::text
    AND (c.confirmed_amount IS NOT NULL OR r.estimated = false)
    AND COALESCE(c.confirmed_amount, r.surplus_amount) > 0::numeric
    AND COALESCE(r.status, 'unknown'::text) = ANY (ARRAY['unclaimed'::text, 'unknown'::text])
    AND COALESCE(c.claim_status, 'unknown'::text) = ANY (ARRAY['unclaimed'::text, 'unknown'::text])
  ORDER BY r.fips, (COALESCE(r.doc_number, r.parcel_apn, r.property_address)), r.auction_date, c.confirmed_as_of DESC NULLS LAST;