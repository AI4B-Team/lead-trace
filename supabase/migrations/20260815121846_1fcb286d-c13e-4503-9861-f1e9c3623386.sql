insert into public.surplus_sources (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
values
(
 'Douglas','GA','tax_deed','pdf_list',
 'https://douglastax.org/pdf/2026/07/EXCESS-FUNDS-FILE-FOR-PDF.pdf',
 jsonb_build_object(
   'columns', jsonb_build_array('sale_date','claimant_name','parcel_apn','tax_years_and_purchaser','sale_price','confirmed_amount','claimed'),
   'rowPattern','^(\d{1,2}/\d{1,2}/\d{4})\s+(.+?)\s*([0-9A-Z]{11})\s+(.+?)\s*\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+(NO)$',
   'skipLines', jsonb_build_array('TAX SALES 2000','SALE DATE DEL TAXPAYER','REAL ESTATE','MOBILE HOME'),
   'defaultClaimStatus','unclaimed'
 ),
 'monthly','live',
 'Tax Commissioner "Tax Sales 2000-Forward Overage" PDF. Confirmed 2026-08-15 against the live file: 71 rows totalling $710,264.39. The list covers every sale since 2000 and prints a CLAIMED column, so the row pattern only accepts CLAIMED = NO — rows already paid out or remitted to the GA Dept of Revenue are deliberately excluded. Delinquent taxpayer name, parcel and sale date are published; no property address.'
),
(
 'Gwinnett','GA','tax_deed','pdf_list',
 'https://www.gwinnetttaxcommissioner.com/documents/d/egov/excess-funds-all-years-rev11052025?download=true',
 jsonb_build_object(
   'columns', jsonb_build_array('purchaser','parcel_apn','owner_and_address','confirmed_amount','sale_month'),
   'rowPattern','^(.+?)\s+([A-Z]\d{4}[A-Z]?\s?\d{2,3}[A-Z]?)\s+(.+?)\s+\$([\d,]+\.\d{2})\s+([A-Za-z]+\.?\s+\d{4})$',
   'skipLines', jsonb_build_array('Gwinnett County Tax Commissioner','Excess Funds'),
   'defaultClaimStatus','unclaimed'
 ),
 'monthly','live',
 'Tax Commissioner "Excess Funds - All Years" PDF. Confirmed 2026-08-15 against the live file: 64 rows totalling $2,334,164.43. Parcel number and amount held are reliable. The extracted text runs the former owner and the situs address together with no separator, so both are kept in raw only rather than guessed apart, and the clerk prints the sale month/year without a day, so sale_date stays null.'
)
on conflict do nothing;