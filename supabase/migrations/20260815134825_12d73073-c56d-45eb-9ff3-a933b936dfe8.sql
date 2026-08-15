-- Georgia counties whose tax commissioners hold surplus in escrow administered
-- by the law firm they retained for excess-funds records (Weissman). The firm
-- publishes one workbook per county on a single index page, refreshed about
-- twice a month, in an identical 9-column layout. Verified 2026-08-15 against
-- the live files. Nothing is inferred: the Excess Funds column is the figure the
-- holder reports, and a row with a Petition Filed Date is recorded as
-- claim_filed because an interpleader is already before Superior Court.
WITH cfg AS (
  SELECT '{
    "indexUrl":"https://www.weissman.law/specialties/excess-tax-funds/",
    "columnMap":{
      "Matter Id":"case_number",
      "Parcel No.":"parcel_apn",
      "Owner":"claimant_name",
      "Address":"property_address",
      "Sale Date":"sale_date",
      "Excess Funds":"confirmed_amount"
    },
    "claimFiledWhenPresent":"Petition Filed Date",
    "defaultClaimStatus":"unclaimed"
  }'::jsonb AS base
), counties(county_name, fips, file_name, rows_seen, total_seen) AS (
  VALUES
    ('Fulton',   '13121', 'Fulton',    31,  681712.43),
    ('Cherokee', '13057', 'Cherokee',  80,  870064.34),
    ('Muscogee', '13215', 'Muscogee',  48,  153142.74),
    ('Newton',   '13217', 'Newton',   124, 2668426.81),
    ('Columbia', '13073', 'Columbia',   8,   55336.59),
    ('Lowndes',  '13185', 'Lowndes',  180, 1172334.45),
    ('Barrow',   '13013', 'Barrow',    15,   91500.44),
    ('Jackson',  '13157', 'Jackson',   27,  673085.42),
    ('Spalding', '13255', 'Spalding',   3,   13313.94),
    ('Bulloch',  '13031', 'Bulloch',   59,  331253.57)
)
INSERT INTO public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, refresh_cadence, status, notes, fetch_config)
SELECT
  c.county_name, 'GA', 'tax_deed', 'xlsx_list',
  'https://www.weissman.law/wp-content/uploads/2026/08/' || c.file_name || '.xlsx',
  'biweekly', 'live',
  'Excess funds workbook for ' || c.county_name || ' County, published by the firm the Tax Commissioner retained to administer excess-funds records. The pinned URL carries the publish month, so the config resolves the current file from the firm''s index page and only falls back to the pinned copy. Verified 2026-08-15: ' || c.rows_seen || ' money rows, $' || to_char(c.total_seen, 'FM999,999,999.00') || ' held.',
  (SELECT base FROM cfg) || jsonb_build_object('linkPattern', '/' || c.file_name || '\.xlsx$')
FROM counties c
ON CONFLICT DO NOTHING;

INSERT INTO public.source_coverage (state, county_name, fips, record_type, status, verified_at)
VALUES
  ('GA','Fulton','13121','surplus_funds','verified',now()),
  ('GA','Cherokee','13057','surplus_funds','verified',now()),
  ('GA','Muscogee','13215','surplus_funds','verified',now()),
  ('GA','Newton','13217','surplus_funds','verified',now()),
  ('GA','Columbia','13073','surplus_funds','verified',now()),
  ('GA','Lowndes','13185','surplus_funds','verified',now()),
  ('GA','Barrow','13013','surplus_funds','verified',now()),
  ('GA','Jackson','13157','surplus_funds','verified',now()),
  ('GA','Spalding','13255','surplus_funds','verified',now()),
  ('GA','Bulloch','13031','surplus_funds','verified',now())
ON CONFLICT DO NOTHING;