INSERT INTO public.surplus_sources (state, county_name, sale_kind, handler, source_url, refresh_cadence, status, fetch_config, notes)
VALUES (
  'GA', 'Hall', 'tax_deed', 'pdf_list',
  'https://hallcountytax.org/wp-content/uploads/2026/06/Website-Excess-Funds-List-06-30-2026.pdf',
  'monthly', 'live',
  '{"columns":["sale_date","purchaser","parcel_apn","owner_and_address","confirmed_amount"],"rowPattern":"^([A-Z][a-z]+ \\d{1,2}, \\d{4}) (.+?) ((?:\\d{5}[A-Z]?[ ]?\\d{6}[A-Z]?)|(?:[MP]\\d{6,8})) (.+?) ([\\d,]+\\.\\d{2})\\$$","joinPattern":"^[A-Z][a-z]+ \\d{1,2}, \\d{4} ","skipLines":["HALL COUNTY TAX COMMISSIONER","TAX SALE DATE","Information current as of"],"defaultClaimStatus":"unclaimed"}'::jsonb,
  'Tax Commissioner "Tax Sale Excess Funds" PDF, dated in-document ("Information current as of"). Confirmed 2026-08-15 against the live file: 66 of 66 money lines parse, $535,128.36 total. The clerk wraps long buyer names onto a second line, so the config uses joinPattern to rejoin them; sale dates are spelled out ("November 1, 2016"). Former owner and situs address are printed without a separator, so both are kept in raw rather than guessed apart.'
);

INSERT INTO public.surplus_county_pages (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1, clerk_city, clerk_postal_code, clerk_phone, official_list_url, latitude, longitude, verified_at, published, claim_process_md)
VALUES (
  'GA', 'ga-hall', 'Hall', 'hall',
  'Hall County Tax Commissioner', '2875 Browns Bridge Road', 'Gainesville', '30504', '(770) 531-6950',
  'https://hallcountytax.org/property/excess-funds/', 34.297900, -83.824100, CURRENT_DATE, true,
  'Hall County publishes a single "Tax Sale Excess Funds" list covering tax sales going back to 2016, stamped with the date the Tax Commissioner last refreshed it. Every balance on that list is money still on hand, so the amounts here are the Tax Commissioner''s own figures rather than an estimate.

Excess funds are held by the Tax Commissioner and paid in the order of priority set by O.C.G.A. 48-4-5: the record owner at the time of sale, then lienholders, then other parties of interest. The Tax Commissioner may interplead disputed funds into Superior Court, and balances that go unclaimed are eventually reported to the state as unclaimed property, so timing matters.

To claim, complete the Tax Commissioner''s Excess Funds Claim Form and submit it with proof of your interest in the property as of the sale date — deed or lien documentation, photo ID, and, for an estate, letters of administration or testamentary. Confirm the current requirements and the exact balance with the Tax Commissioner before filing; the published amount can change once fees or competing claims are applied.'
);