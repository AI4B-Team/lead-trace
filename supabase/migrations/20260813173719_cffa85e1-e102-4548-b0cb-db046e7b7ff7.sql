-- 1. Public surplus view: accept clerk-primary rows (estimated = false) as
-- confirmed even without a surplus_confirmations overlay. A county clerk's own
-- published surplus list IS the confirmation; requiring an overlay row hid all
-- clerk-primary counties (Marion) from the public guide pages.
CREATE OR REPLACE VIEW public.surplus_records_public AS
SELECT DISTINCT ON (r.fips, COALESCE(r.doc_number, r.parcel_apn, r.property_address), r.auction_date)
    r.id,
    r.fips AS county_fips,
    cp.slug AS county_slug,
    cp.county_name,
    r.state AS state_code,
    CASE WHEN r.surplus_basis = 'opening_bid' THEN 'tax_deed' ELSE 'mortgage_foreclosure' END AS sale_type,
    COALESCE(c.confirmed_amount, r.surplus_amount) AS surplus_amount,
    r.auction_date AS sale_date,
    CASE
      WHEN s.escheat_days IS NULL OR r.auction_date IS NULL THEN NULL::date
      ELSE (r.auction_date + s.escheat_days)
    END AS escheat_date,
    r.created_at AS first_seen_at,
    COALESCE(c.confirmed_as_of, r.updated_at) AS confirmed_at,
    COALESCE(c.source_url, r.source_url) AS source_url
FROM distress_records r
  LEFT JOIN surplus_confirmations c
    ON c.derived_record_id = r.id AND c.confirmed_amount IS NOT NULL
  JOIN surplus_state_pages sp ON sp.state = r.state AND sp.published = true
  JOIN surplus_county_pages cp ON cp.county_fips = r.fips AND cp.published = true
  LEFT JOIN surplus_statutes s
    ON s.state = r.state AND s.published = true
   AND s.sale_kind = CASE WHEN r.surplus_basis = 'opening_bid' THEN 'tax_deed' ELSE 'foreclosure' END
WHERE r.record_type = 'surplus_funds'
  AND (c.confirmed_amount IS NOT NULL OR r.estimated = false)
  AND COALESCE(c.confirmed_amount, r.surplus_amount) > 0
  AND COALESCE(c.claim_status, 'unknown') IN ('unclaimed', 'unknown')
ORDER BY r.fips, COALESCE(r.doc_number, r.parcel_apn, r.property_address), r.auction_date,
         c.confirmed_as_of DESC NULLS LAST;

-- 2. Florida editorial state page (human-verified 2026-08-13, Fla. Stat. 197.582).
INSERT INTO public.surplus_state_pages
  (state, primary_term, clerk_title, term_aliases, overview_md, owner_record_date, last_verified_at, notes, published)
VALUES (
  'FL',
  'Surplus Funds',
  'Clerk of the Circuit Court and Comptroller',
  ARRAY['surplus funds','excess proceeds','overbid','tax deed surplus'],
  E'When a Florida property sells at a tax deed auction for more than the opening bid, the extra money is called surplus funds. The county Clerk of the Circuit Court and Comptroller holds that money for the people who had an interest in the property on the day the tax deed application was made — usually the former owner, and sometimes a lienholder whose claim was wiped out by the sale.\n\nFlorida gives those parties a limited window to claim it. Under Fla. Stat. 197.582, the clerk mails a notice of surplus funds and a claim form to every party named in the property information report. A claim must be filed with the clerk within 120 days of that notice; if nobody claims the money, the clerk sends it to the Florida Department of Financial Services, where it becomes unclaimed property under Chapter 717.\n\nYou never have to pay anyone to get your own surplus funds. Filing directly with the clerk is free. Third-party recovery companies are allowed to help, but Florida caps their fee at 12% of the surplus, and a claim you file yourself costs nothing at all.\n\nLeadTrace publishes only the surplus amounts a Florida clerk has published itself. We do not estimate balances, and we do not present our own arithmetic as a clerk balance.',
  'the date the tax deed application was made',
  '2026-08-13',
  'Statute values human-verified against Fla. Stat. 197.582 on 2026-08-13: 120-day claim and escheat window measured from the sale, escheat to DFS under Ch. 717, 12% recovery fee cap.',
  true
)
ON CONFLICT (state) DO UPDATE SET
  primary_term = EXCLUDED.primary_term,
  clerk_title = EXCLUDED.clerk_title,
  term_aliases = EXCLUDED.term_aliases,
  overview_md = EXCLUDED.overview_md,
  owner_record_date = EXCLUDED.owner_record_date,
  last_verified_at = EXCLUDED.last_verified_at,
  notes = EXCLUDED.notes,
  published = true,
  updated_at = now();

-- 3. Marion County page — the one county whose clerk list we ingest end to end.
INSERT INTO public.surplus_county_pages
  (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1, clerk_city,
   clerk_postal_code, clerk_phone, official_list_url, claim_process_md, verified_at, published)
VALUES (
  'FL', 'fl-marion', 'Marion', 'marion',
  'Marion County Clerk of Court and Comptroller',
  '110 NW 1st Avenue', 'Ocala', '34475', '(352) 671-5604',
  'https://www.marioncountyclerk.org/departments/records-recording/tax-deeds-and-lands-available-for-taxes/unclaimed-funds/',
  E'Marion County publishes its own Tax Deeds Surplus Funds report and refreshes it regularly. Every amount we show for Marion comes from that published report.\n\nTo claim surplus funds in Marion County, file a statement of claim with the Clerk''s Tax Deeds department, identifying the sale number and parcel from the surplus report and attaching proof of your interest in the property as of the tax deed application date. There is no fee to file your own claim.',
  '2026-08-13',
  true
)
ON CONFLICT (county_fips) DO UPDATE SET
  clerk_office_name = EXCLUDED.clerk_office_name,
  official_list_url = EXCLUDED.official_list_url,
  claim_process_md = EXCLUDED.claim_process_md,
  verified_at = EXCLUDED.verified_at,
  published = true,
  updated_at = now();

-- 4. Florida FAQs for the guide pages.
INSERT INTO public.surplus_faqs (state, county_fips, question, answer_md, sort_order, published)
VALUES
 ('FL', NULL, 'How long do I have to claim surplus funds in Florida?',
  'You have 120 days from the clerk''s notice of surplus funds. After that the clerk transfers the money to the Florida Department of Financial Services as unclaimed property under Chapter 717, and you must claim it from the state instead.', 1, true),
 ('FL', NULL, 'Do I have to pay a recovery company to get my money?',
  'No. Filing a claim directly with the clerk is free. Florida caps a third-party recovery fee at 12% of the surplus, so anyone asking for more than that is outside the statute.', 2, true),
 ('FL', NULL, 'Who is entitled to Florida surplus funds?',
  'The parties who held an interest in the property on the date the tax deed application was made — most often the former owner, and in some cases a lienholder whose lien was extinguished by the sale.', 3, true),
 ('FL', 'fl-marion', 'Where does Marion County publish its surplus list?',
  'On the Marion County Clerk''s Unclaimed Funds page, as a Tax Deeds Surplus Funds report. The report lists the sale number, sale date, parcel number and current balance; it does not list owner names.', 1, true)
ON CONFLICT DO NOTHING;