INSERT INTO public.surplus_county_pages (
  county_fips, county_name, state, slug, published, verified_at,
  clerk_office_name, clerk_address_line1, clerk_address_line2, clerk_city, clerk_postal_code, clerk_phone,
  official_list_url, claim_process_md
) VALUES (
  'fl-hillsborough', 'Hillsborough', 'FL', 'hillsborough', true, '2026-08-15',
  'Hillsborough County Clerk of the Circuit Court — Tax Deeds',
  'Tax Deeds Department', 'PO Box 3360', 'Tampa, FL', '33601-3360', '(813) 276-8100 ext. 7805',
  'https://www.hillsclerk.com/records-and-reports/public-data-files',
  E'Hillsborough County publishes a Weekly Tax Deed Spreadsheet of excess proceeds the Clerk''s accounting department has not yet disbursed. Every Hillsborough amount we show comes from that spreadsheet, exactly as the Clerk maintains it: file (case) number and unclaimed balance only. The Clerk does not publish the sale date, former owner name, or address on that list.\n\nTo claim excess proceeds, file the Clerk''s affidavit by mail — claims are only accepted by mail at the address printed on the claim form. Which form applies depends on the sale date: sales before August 15, 2019 use the TD-Excess Proceeds Affidavit; sales on or after August 15, 2019 use the TD-120 Day Surplus Proceeds Affidavit.\n\nTitleholders must include a legible copy of government-issued identification; lienholders must document the lien. Confirm current requirements with the Clerk at (813) 276-8100 ext. 7805 before mailing anything.'
)
ON CONFLICT (county_fips) DO UPDATE SET
  published = EXCLUDED.published,
  verified_at = EXCLUDED.verified_at,
  clerk_office_name = EXCLUDED.clerk_office_name,
  clerk_address_line1 = EXCLUDED.clerk_address_line1,
  clerk_address_line2 = EXCLUDED.clerk_address_line2,
  clerk_city = EXCLUDED.clerk_city,
  clerk_postal_code = EXCLUDED.clerk_postal_code,
  clerk_phone = EXCLUDED.clerk_phone,
  official_list_url = EXCLUDED.official_list_url,
  claim_process_md = EXCLUDED.claim_process_md,
  updated_at = now();

INSERT INTO public.source_coverage (state, county_name, fips, record_type, status, verified_at, last_success_at, sample_row_count)
SELECT 'FL', 'Hillsborough', '12057', 'surplus_funds', 'verified', now(), now(),
       (SELECT count(*) FROM public.distress_records WHERE record_type = 'surplus_funds' AND fips = 'fl-hillsborough')
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_coverage
   WHERE state = 'FL' AND county_name ILIKE 'Hillsborough' AND record_type = 'surplus_funds'
);