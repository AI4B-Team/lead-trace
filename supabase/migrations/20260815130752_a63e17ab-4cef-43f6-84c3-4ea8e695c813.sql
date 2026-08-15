INSERT INTO public.surplus_sources (county_name, state, sale_kind, handler, source_url, refresh_cadence, status, notes, fetch_config)
VALUES
('Forsyth', 'GA', 'tax_deed', 'html_table',
 'https://forsythcountytax.com/excess-funds-listing-2/',
 'monthly', 'live',
 'Tax Commissioner "Excess Funds Listing" published as a single HTML table on the county tax site. Confirmed 2026-08-15 against the live page: 17 of 17 data rows parse with both a sale date and an amount, $429,949.93 total. Columns used are DATE SOLD, PARCEL ID, PROPERTY ADDRESS and EXCESS FUNDS; the defendant-in-fifa name and mailing address are kept in raw rather than presented as a claimant, and PURCHASE PRICE / TOTAL AMOUNT DUE are deliberately not treated as the surplus. The county lists only balances still on hand, so rows default to unclaimed.',
 '{"columnMap":{"DATE SOLD":"sale_date","PARCEL ID":"parcel_apn","PROPERTY ADDRESS":"property_address","EXCESS FUNDS":"confirmed_amount"},"defaultClaimStatus":"unclaimed"}'::jsonb);

INSERT INTO public.surplus_county_pages
  (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1, clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md, published, verified_at)
VALUES
('GA', 'ga-forsyth', 'Forsyth', 'forsyth',
 'Forsyth County Tax Commissioner', '1092 Tribble Gap Rd.', 'Cumming, GA', '30040', '(770) 781-2110',
 'https://forsythcountytax.com/excess-funds-listing-2/',
 'Forsyth County publishes its excess funds listing directly on the Tax Commissioner''s website as a table of tax sales. Each line shows the date sold, the parcel number, the name and mailing address the funds are recorded under, the property address, the purchase price, the taxes due, and the excess funds left over. The figures shown here are the excess funds column only.

The Tax Commissioner asks that all claim correspondence be directed to David D. Hicks, Tax Commissioner (ddhicks@forsythco.com, 770.781.2112). Mail is only received at the 1092 Tribble Gap Road office.

Excess funds are paid out in the order of priority set by O.C.G.A. 48-4-5 — the former record owner, then lienholders of record. Submit a written claim with proof of your interest in the property; the office may require an affidavit and, where claims compete, may interplead the funds into Superior Court rather than decide between claimants itself. Unclaimed balances are eventually remitted to the Georgia Department of Revenue as unclaimed property.',
 true, CURRENT_DATE);

INSERT INTO public.source_coverage (state, county_name, fips, record_type, status, verified_at)
VALUES ('GA', 'Forsyth', '13117', 'surplus_funds', 'verified', now());