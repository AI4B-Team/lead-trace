-- Manatee County, FL: clerk-published surplus table goes live
UPDATE public.surplus_sources
SET handler = 'html_table',
    status = 'live',
    refresh_cadence = 'weekly',
    source_url = 'https://www.manateeclerk.com/departments/tax-deeds/list-of-unclaimed-funds/',
    fetch_config = jsonb_build_object(
      'columnMap', jsonb_build_object(
        'Case Number','case_number',
        'Sale Date','sale_date',
        'Property Owner','claimant_name',
        'Surplus Funds','confirmed_amount',
        '1 Year from Sale Date','claim_deadline'
      ),
      'defaultClaimStatus','unclaimed'
    ),
    last_checked_at = now(),
    notes = 'Clerk List of Unclaimed Funds (Tax Deeds). Confirmed 2026-08-15 against the live page: case number, sale date, property owner, surplus amount and the clerk-printed one-year deadline all published. Parsed 8 held balances.',
    updated_at = now()
WHERE state = 'FL' AND county_name = 'Manatee' AND sale_kind = 'tax_deed';

INSERT INTO public.surplus_sources (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes, last_checked_at)
SELECT 'Manatee','FL','tax_deed','html_table','https://www.manateeclerk.com/departments/tax-deeds/list-of-unclaimed-funds/',
       jsonb_build_object(
         'columnMap', jsonb_build_object(
           'Case Number','case_number','Sale Date','sale_date','Property Owner','claimant_name',
           'Surplus Funds','confirmed_amount','1 Year from Sale Date','claim_deadline'),
         'defaultClaimStatus','unclaimed'),
       'weekly','live',
       'Clerk List of Unclaimed Funds (Tax Deeds). Confirmed 2026-08-15 against the live page: case number, sale date, property owner, surplus amount and the clerk-printed one-year deadline all published.',
       now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.surplus_sources WHERE state='FL' AND county_name='Manatee' AND sale_kind='tax_deed'
);

-- Probe results for counties with no machine-readable list, or blocked
UPDATE public.surplus_sources
SET status = 'broken', last_checked_at = now(),
    notes = 'Probed 2026-08-15: clerk tax deed page blocks datacenter IPs (403/503 WAF). Residential proxy is reserved for RealAuction only.',
    updated_at = now()
WHERE state='FL' AND sale_kind='tax_deed' AND county_name IN ('Duval','Lee','Escambia','Collier');

INSERT INTO public.surplus_sources (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes, last_checked_at)
SELECT v.county, 'FL','tax_deed','html_table', v.url, '{}'::jsonb, 'monthly','unverified', v.note, now()
FROM (VALUES
  ('Sarasota','https://www.sarasotaclerk.com/Home-and-Property/Tax-Deeds/Surplus-Funds-from-Tax-Deed-Sale','Probed 2026-08-15: clerk explains surplus notices and publishes the claim form, but no list of held balances. Re-probe monthly.'),
  ('Volusia','https://www.clerk.org/tax-deed-sales','Probed 2026-08-15: tax deed page reachable, no surplus list published. Re-probe monthly.')
) AS v(county,url,note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.surplus_sources s WHERE s.state='FL' AND s.county_name=v.county AND s.sale_kind='tax_deed'
);

-- Public county guide for Manatee
INSERT INTO public.surplus_county_pages (
  county_fips, county_name, state, slug, published, verified_at,
  clerk_office_name, clerk_address_line1, clerk_address_line2, clerk_city, clerk_postal_code, clerk_phone,
  official_list_url, claim_process_md
) VALUES (
  'fl-manatee','Manatee','FL','manatee', true, '2026-08-15',
  'Manatee County Clerk of the Circuit Court & Comptroller — Tax Deeds',
  '1115 Manatee Avenue West', 'PO Box 25400', 'Bradenton, FL', '34206', '(941) 749-1800',
  'https://www.manateeclerk.com/departments/tax-deeds/list-of-unclaimed-funds/',
  E'Manatee County publishes a List of Unclaimed Funds for tax deed sales. Every Manatee figure we show comes from that page exactly as the Clerk maintains it: case number, sale date, former property owner, surplus amount, and the one-year date measured from the sale.\n\nSurplus funds are held by the Clerk for one year from the sale date. The Clerk prints that one-year date next to each case — treat it as the operative deadline, not an estimate. Funds not claimed within the holding period are remitted to the State of Florida as unclaimed property.\n\nTo claim, contact the Clerk''s Tax Deeds department at (941) 749-1800 and file the Notice of Surplus Funds / claim paperwork from the Clerk''s forms library. Case files are searchable at records.manateeclerk.com under Court Records using the tax deed case number. Confirm current requirements with the Clerk before mailing anything.'
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

-- Coverage registration so the feed and AI Assistant report Manatee
INSERT INTO public.source_coverage (state, county_name, fips, record_type, status, verified_at, last_success_at, sample_row_count)
SELECT 'FL','Manatee','12081','surplus_funds','verified', now(), now(),
       (SELECT count(*) FROM public.distress_records WHERE record_type='surplus_funds' AND fips='fl-manatee')
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_coverage WHERE state='FL' AND county_name ILIKE 'Manatee' AND record_type='surplus_funds'
);