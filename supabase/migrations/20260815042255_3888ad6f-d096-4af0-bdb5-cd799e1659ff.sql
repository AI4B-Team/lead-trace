INSERT INTO public.surplus_state_pages (state, primary_term, term_aliases, clerk_title, overview_md, owner_record_date, notes, last_verified_at, published)
VALUES (
  'GA',
  'Excess Funds',
  ARRAY['excess funds','surplus funds','overage','excess tax sale funds'],
  'Tax Commissioner',
  E'In Georgia, money left over after a delinquent property tax sale is called **excess funds**. Unlike most states, the funds are held by the county **Tax Commissioner** rather than a court clerk, and each county publishes its own excess funds list.\n\nExcess funds belong to the parties with a claim on the property at the time of the sale — typically the former owner of record, then lienholders in order of priority. Counties generally require a written claim with proof of identity and proof of interest before releasing money.\n\nAlways confirm current claim requirements and deadlines directly with the county Tax Commissioner before acting on any list.',
  'Date of the tax sale',
  'Statutory claim window and escheat timing for GA are not yet verified from an official source, so no deadline is asserted on Georgia pages.',
  CURRENT_DATE,
  true
)
ON CONFLICT (state) DO UPDATE SET
  primary_term = EXCLUDED.primary_term,
  term_aliases = EXCLUDED.term_aliases,
  clerk_title = EXCLUDED.clerk_title,
  overview_md = EXCLUDED.overview_md,
  owner_record_date = EXCLUDED.owner_record_date,
  notes = EXCLUDED.notes,
  last_verified_at = EXCLUDED.last_verified_at,
  published = EXCLUDED.published,
  updated_at = now();

INSERT INTO public.surplus_county_pages (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1, clerk_address_line2, clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md, verified_at, published)
VALUES (
  'GA',
  '13089',
  'DeKalb',
  'dekalb',
  'DeKalb County Tax Commissioner',
  'Property Tax Division',
  'P.O. Box 100004',
  'Decatur, GA',
  '30031-7004',
  '404-298-4000',
  'https://dekalbtaxga.gov/wp-content/uploads/Excess-Funds-List.pdf',
  E'DeKalb County publishes its excess funds list as a PDF maintained by the Tax Commissioner''s Property Tax Division. Each entry shows the parcel number, the tax sale date, the amount held, the name the funds are recorded under, and the property address.\n\nTo pursue a claim, contact the Property Tax Division in writing at the address above and ask for the current excess funds claim packet. Expect to provide government-issued identification and documentation proving your interest in the property as of the tax sale date (deed, assignment, or recorded lien).\n\nDeKalb does not accept claims by phone. Confirm current requirements with the Tax Commissioner''s Office at 404-298-4000 before submitting anything.',
  CURRENT_DATE,
  true
)
ON CONFLICT (state, slug) DO UPDATE SET
  county_fips = EXCLUDED.county_fips,
  county_name = EXCLUDED.county_name,
  clerk_office_name = EXCLUDED.clerk_office_name,
  clerk_address_line1 = EXCLUDED.clerk_address_line1,
  clerk_address_line2 = EXCLUDED.clerk_address_line2,
  clerk_city = EXCLUDED.clerk_city,
  clerk_postal_code = EXCLUDED.clerk_postal_code,
  clerk_phone = EXCLUDED.clerk_phone,
  official_list_url = EXCLUDED.official_list_url,
  claim_process_md = EXCLUDED.claim_process_md,
  verified_at = EXCLUDED.verified_at,
  published = EXCLUDED.published,
  updated_at = now();