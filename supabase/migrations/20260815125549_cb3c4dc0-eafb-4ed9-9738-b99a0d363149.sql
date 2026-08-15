INSERT INTO public.surplus_sources (county_name, state, sale_kind, handler, source_url, refresh_cadence, status, notes, fetch_config)
VALUES
('Henry', 'GA', 'tax_deed', 'pdf_list',
 'https://henrycountytax.com/DocumentCenter/View/296/Excess-Funds-List',
 'monthly', 'live',
 'Tax Commissioner "Excess Funds List" PDF (DocumentCenter/View/296). Confirmed 2026-08-15 against the live file: 114 unclaimed rows totalling $2,310,317.83. The list prints REDEEMED in place of (or after) the amount once a balance is paid out, so the row pattern only accepts lines ending in the dollar figure — redeemed rows are deliberately excluded rather than shown as available. Owner name and situs address are printed without a separator, so both are kept in raw rather than guessed apart.',
 '{"columns":["parcel_apn","owner_and_address","sale_date","confirmed_amount"],"rowPattern":"^([A-Za-z0-9][A-Za-z0-9-]{7,13}) (.+?) (\\d{1,2}/\\d{1,2}/\\d{4}) \\$?([\\d,]+\\.\\d{2})\\$?$","skipLines":["PARCEL ID OWNER"],"defaultClaimStatus":"unclaimed"}'::jsonb),
('Troup', 'GA', 'tax_deed', 'pdf_list',
 'https://troupcountytax.com/wp-content/uploads/2025/11/Nov-2025-List-Info.pdf',
 'monthly', 'live',
 'Tax Commissioner "Excess Funds List" PDF, republished monthly under a dated wp-content path. Confirmed 2026-08-15 against the live file: 105 of 105 money lines parse, $695,665.52 total. Columns are sale date, owner, map/parcel number, property address and excess funds; the county publishes only balances still on hand, so rows default to unclaimed.',
 '{"columns":["sale_date","owner_name","parcel_apn","property_address","confirmed_amount"],"rowPattern":"^(\\d{1,2}/\\d{1,2}/\\d{4}) (.+?) ?(\\d{3,5}[A-Z]?[ -]\\d{3,4}[ -]\\d{3}[A-Z]?) (.+?) \\$([\\d,]+\\.\\d{2})$","skipLines":["DATE OF","Excess","Funds","OWNER MAP#"],"defaultClaimStatus":"unclaimed"}'::jsonb);

INSERT INTO public.surplus_county_pages
  (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1, clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md, published, verified_at)
VALUES
('GA', 'ga-henry', 'Henry', 'henry',
 'Henry County Tax Commissioner', '140 Henry Parkway', 'McDonough, GA', '30253', '(770) 288-8180',
 'https://henrycountytax.com/239/EXCESS-FUNDS',
 'Henry County publishes an "Excess Funds List" PDF through the Tax Commissioner''s office, covering tax sales going back to 2020. Each line shows the parcel number, the name and address the funds are recorded under, the tax sale date, and the amount being held.

Once a balance has been redeemed or paid out, the Tax Commissioner marks the line REDEEMED. We only list balances that still show a dollar amount, so nothing here is money the county has already released.

Excess funds are paid out in the order of priority set by O.C.G.A. 48-4-5 — the former record owner, then lienholders of record. Claims go to the Tax Commissioner in writing with proof of your interest in the property; the office may require an affidavit and will not decide competing claims itself. If two or more parties claim the same funds, the Tax Commissioner may interplead the money into Superior Court and let the court decide. Unclaimed balances are eventually remitted to the Georgia Department of Revenue as unclaimed property.',
 true, CURRENT_DATE),
('GA', 'ga-troup', 'Troup', 'troup',
 'Troup County Tax Commissioner', '100 Ridley Avenue', 'LaGrange, GA', '30240', '(706) 883-1620',
 'https://troupcountytax.com/excess-funds-list/',
 'Troup County publishes its excess funds list as a dated PDF that the Tax Commissioner replaces each month. Every figure we show is read straight from that document: the tax sale date, the name the funds are recorded under, the map/parcel number, the property address, and the excess funds still on hand.

Because the county republishes the whole list rather than annotating paid claims, a balance disappearing from the list is how the office signals it has been released.

Excess funds are paid out in the order of priority set by O.C.G.A. 48-4-5 — the former record owner, then lienholders of record. Submit a written claim with proof of your interest to the Tax Commissioner; the office may require an affidavit and, where claims compete, may interplead the funds into Superior Court. Unclaimed balances are eventually remitted to the Georgia Department of Revenue as unclaimed property.',
 true, CURRENT_DATE);

INSERT INTO public.source_coverage (state, county_name, fips, record_type, status, verified_at)
VALUES
('GA', 'Henry', '13151', 'surplus_funds', 'verified', now()),
('GA', 'Troup', '13285', 'surplus_funds', 'verified', now());