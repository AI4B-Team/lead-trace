-- Surplus feed: fall back to the clerk-published sale date.
--
-- `surplus_records_visible` derived sale_date, escheat_date and days_to_escheat
-- ONLY from the Phase-1 derived row's auction_date (r.auction_date). Counties
-- that arrive through the clerk overlay path without a RealAuction-derived sale
-- date (e.g. Hillsborough, Pasco) have r.auction_date = NULL, so every one of
-- those rows rendered an em dash for Sale Date AND the escheat countdown — even
-- when the clerk's own list published the sale date, which we already store in
-- surplus_confirmations.sale_date (c.sale_date).
--
-- Fix: the sale-date basis is COALESCE(r.auction_date, c.sale_date). The derived
-- auction date still wins when present (it is the canonical registry value); the
-- clerk-published sale date fills in only when there is no derived date. Nothing
-- is invented — c.sale_date is a value the clerk actually printed. When neither
-- exists the columns stay NULL and honestly render as an em dash.

CREATE OR REPLACE VIEW public.surplus_records_visible AS
  SELECT r.id,
     c.workspace_id,
     r.fips AS county_fips,
     r.county AS county_name,
     r.state AS state_code,
     r.doc_number AS case_number,
         CASE
             WHEN r.surplus_basis = 'opening_bid'::text THEN 'tax_deed'::text
             ELSE 'mortgage_foreclosure'::text
         END AS sale_type,
     r.property_address,
     r.property_city,
     r.property_zip,
     r.parcel_apn AS parcel_id,
     NULLIF(TRIM(BOTH FROM COALESCE(r.company_entity, concat_ws(' '::text, r.owner_first, r.owner_last))), ''::text) AS owner_of_record,
     COALESCE(r.auction_date, c.sale_date) AS sale_date,
         CASE
             WHEN r.surplus_basis = 'opening_bid'::text THEN r.amount
             ELSE NULL::numeric
         END AS opening_bid,
         CASE
             WHEN r.surplus_basis = 'final_judgment'::text THEN r.amount
             ELSE NULL::numeric
         END AS judgment_amount,
         CASE
             WHEN r.amount IS NOT NULL AND r.surplus_amount IS NOT NULL AND r.estimated IS NOT FALSE THEN r.amount + r.surplus_amount
             ELSE NULL::numeric
         END AS winning_bid,
     COALESCE(c.confirmed_amount, r.surplus_amount) AS surplus_amount,
         CASE
             WHEN c.confirmed_amount IS NOT NULL OR r.estimated IS FALSE THEN 'clerk_published'::text
             ELSE 'derived'::text
         END AS surplus_basis,
         CASE
             WHEN c.confirmed_amount IS NOT NULL OR r.estimated IS FALSE THEN 'clerk_confirmed'::text
             ELSE 'derived'::text
         END AS confidence,
     c.variance_pct,
         CASE
             WHEN c.id IS NOT NULL OR r.estimated IS FALSE THEN 'clerk'::text
             ELSE 'auction'::text
         END AS source_registry,
     COALESCE(c.source_url, r.source_url) AS source_url,
     COALESCE(c.claim_status, r.status, 'unknown'::text) AS disbursement_status,
     COALESCE(
       c.claim_deadline,
       CASE
         WHEN r.estimated IS FALSE AND s.claim_window_days IS NOT NULL AND s.window_starts_from = 'sale_date' AND COALESCE(r.auction_date, c.sale_date) IS NOT NULL
           THEN COALESCE(r.auction_date, c.sale_date) + s.claim_window_days
         ELSE NULL::date
       END
     ) AS claim_deadline,
     COALESCE(c.deadline_from_clerk, false) AS deadline_from_clerk,
         CASE
             WHEN s.escheat_days IS NULL OR COALESCE(r.auction_date, c.sale_date) IS NULL THEN NULL::date
             ELSE COALESCE(r.auction_date, c.sale_date) + s.escheat_days
         END AS escheat_date,
         CASE
             WHEN s.escheat_days IS NULL OR COALESCE(r.auction_date, c.sale_date) IS NULL THEN NULL::integer
             ELSE COALESCE(r.auction_date, c.sale_date) + s.escheat_days - CURRENT_DATE
         END AS days_to_escheat,
     s.fee_cap_pct AS fee_cap_percent,
     s.statute_citation AS fee_cap_citation,
     s.escheat_destination,
     s.recovery_permitted,
     s.assignment_permitted,
     r.created_at AS first_seen_at,
     COALESCE(c.confirmed_as_of, CASE WHEN r.estimated IS FALSE THEN r.updated_at ELSE NULL END) AS confirmed_at
    FROM distress_records r
      JOIN surplus_statutes s ON s.state = r.state AND s.published = true AND s.sale_kind =
         CASE
             WHEN r.surplus_basis = 'opening_bid'::text THEN 'tax_deed'::text
             ELSE 'foreclosure'::text
         END
      LEFT JOIN surplus_confirmations c ON c.derived_record_id = r.id
   WHERE r.record_type = 'surplus_funds'::text AND r.surplus_amount IS NOT NULL;
