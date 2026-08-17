insert into public.surplus_statutes (
  state, sale_kind, statute_citation, claim_window_days, window_starts_from,
  fee_cap_pct, requires_finder_license, assignment_permitted, recovery_permitted,
  escheat_days, escheat_starts_from, escheat_destination,
  published, verified_by, verified_at, source_url, notes
) values (
  'CA', 'tax_deed', 'Cal. Rev. & Tax. Code § 4674, § 4675', 365, null,
  null, null, true, true,
  365, null, 'County general fund of the county (Cal. Rev. & Tax. Code § 4674), after county cost deductions — NOT a state unclaimed-property program',
  true,
  'statute text read 2026-08-17 (§ 4675(a)(1) and § 4674, california.public.law mirror of leginfo; leginfo.legislature.ca.gov robots.txt disallows crawling)',
  now(),
  'https://california.public.law/codes/ca_rev_and_tax_code_section_4675',
  'Window trigger is recordation of the tax collector''s deed to the purchaser, which none of the allowed window_starts_from values names, so window_starts_from stays NULL rather than being mislabelled sale_date. § 4675(a)(1): a party of interest may file at any time prior to the expiration of one year following that recordation; (a)(2) requires the claim to be postmarked on or before the one-year date. § 4674: excess not claimed within that period may be transferred to the county general fund. Neither section sets a fee cap, so fee_cap_pct stays NULL; § 4675(b) permits assignment only by a dated written instrument with full disclosure.'
);

insert into public.surplus_sources (
  county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes
) values
(
  'Los Angeles', 'CA', 'tax_deed', 'pdf_list', 'https://ttc.lacounty.gov/notice-of-excess-proceeds/',
  jsonb_build_object(
    'resolveLatestFrom', 'https://ttc.lacounty.gov/notice-of-excess-proceeds/',
    'linkMatch', 'EP-Listing',
    'columns', jsonb_build_array('parcel_apn','case_number','purchase_price','confirmed_amount'),
    'rowPattern', '^(\d{4}-\d{3}-\d{3})\s+(\d+)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$',
    'defaultClaimStatus', 'unclaimed'
  ),
  'monthly', 'live',
  'Layout human-confirmed 2026-08-17 against EP-Listing-Public-2026A.pdf (2026A online auction, April 18-21 2026): header reads Parcel / Item / Purchase Price / Excess Proceeds. Parcel -> parcel_apn, Item -> case_number, Excess Proceeds -> confirmed_amount, Purchase Price kept raw. No owner name and no per-row sale date are printed, so claimant_name and sale_date stay NULL. 121 rows parse, 103 carry money ($3,665,636.45); the $0.00 rows are dropped by the amount gate. Filename rotates per auction, so the stable /notice-of-excess-proceeds/ page is resolved for the latest EP-Listing*.pdf.'
),
(
  'San Joaquin', 'CA', 'tax_deed', 'pdf_list',
  'https://www.sjgov.org/docs/default-source/treasurer---tax-collector-documents/excess-proceeds/excess-proceeds-march-2026.pdf?sfvrsn=1f82eec3_21',
  jsonb_build_object(
    'columns', jsonb_build_array('case_number','parcel_apn','default_number','claimant_name','property_address','redemption_amount','purchase_price','confirmed_amount'),
    'rowPattern', '^(\d+)\s+(\d{3}-\d{3}-\d{3}-\d{3})\s+(DEF-[\d-]+)\s+(.+?)\s+((?:NO SITUS|\d[^$]*?))\s+([\d,]+\.\d{2})\$\s+([\d,]+\.\d{2})\$\s+([\d,]+\.\d{2})\$$',
    'defaultClaimStatus', 'unclaimed'
  ),
  'monthly', 'live',
  'Layout human-confirmed 2026-08-17 against excess-proceeds-march-2026.pdf ("Tax Sale Excess Proceeds List, March 11-12 2026, updated April 8 2026"): header reads Item Number / Assessor''s Parcel Number / Default Number / Previous Owner / Situs / Redemption Amount / Purchase Price / Excess Proceeds. Amounts print with a trailing dollar sign. Previous Owner -> claimant_name, Situs -> property_address ("NO SITUS" cleaned out downstream), Excess Proceeds -> confirmed_amount. The sale date is only in the document title, not per row, so sale_date stays NULL. 3 rows parse, all with money ($443,933.15); the trailing totals line does not match the pattern and is excluded. Filename is month-dated under a stable folder but lexical ordering would pick "may" over "march", so the URL is pinned and refreshed monthly rather than auto-resolved.'
),
(
  'Orange', 'CA', 'tax_deed', 'pdf_list', 'https://octreasurer.gov/proptax/pta',
  jsonb_build_object(
    'resolveLatestFrom', 'https://octreasurer.gov/proptax/pta',
    'linkMatch', 'Internet.{0,3}Auction',
    'columns', jsonb_build_array('case_number','parcel_apn','default_number','claimant_name','property_address','minimum_bid','sale_price','confirmed_amount','recording_date'),
    'rowPattern', '^(\d{2,4})\s+(\d{3}-\d{3}-\d{2})\s+(\d{2}-\d{6})\s+(.+?)\s+((?:SITUS NA|NO SITUS|\d[^$]*?),\s*[A-Z][A-Z ]+?)\s+\$?([\d,]+(?:\.\d{2})?)\$?\s+\$?([\d,]+(?:\.\d{2})?)\$?\s+\$?([\d,]+\.\d{2})\$?\s+(\d{1,2}/\d{1,2}/\d{2,4})\b',
    'joinPattern', '^(?:\d{2,4}\s+)?\d{3}-\d{3}-\d{2}\s+\d{2}-\d{6}',
    'defaultClaimStatus', 'unclaimed'
  ),
  'monthly', 'unverified',
  'Layout human-confirmed 2026-08-17 against "Excess Proceeds - Internet Auction #1397.pdf": header reads ITEM NO. / PARCEL NO. / TAX DEFAULT NO. / ASSESSEE NAME / PROPERTY ADDRESS / MINIMUM BID / SALE PRICE / EXCESS PROCEEDS / RECORDING DATE. Assessee Name -> claimant_name, Property Address -> property_address, Excess Proceeds -> confirmed_amount, Tax Default No. kept raw. The only date printed is the deed RECORDING date, not a sale date, so sale_date stays NULL rather than being mislabelled. 42 rows parse with money ($2,217,353.99), zero unmatched. Held at unverified on purpose: that list is from the August 2021 auction, past the one-year § 4675 claim window, so it must not be shown as claimable. The county''s only current posting is the timeshare re-offer auction #1398 list, a different column order in which every Excess Proceeds cell is $0.00, so it is not mapped. Promote when a new internet-auction real-property list is posted.'
);