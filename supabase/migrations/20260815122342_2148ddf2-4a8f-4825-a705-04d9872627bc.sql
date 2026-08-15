update public.surplus_sources set
  source_url = 'https://www.gwinnetttaxcommissioner.com/documents/d/egov/excess-funds-all-years-rev11052025?download=true',
  handler = 'pdf_list',
  fetch_config = jsonb_build_object(
    'columns', jsonb_build_array('purchaser','parcel_apn','owner_and_address','confirmed_amount','sale_month'),
    'rowPattern','^(.+?)\s+([A-Z]\d{4}[A-Z]?\s?\d{2,3}[A-Z]?)\s+(.+?)\s+\$([\d,]+\.\d{2})\s+([A-Za-z]+\.?\s+\d{4})$',
    'skipLines', jsonb_build_array('Gwinnett County Tax Commissioner','Excess Funds'),
    'defaultClaimStatus','unclaimed'
  ),
  status = 'live',
  consecutive_failures = 0,
  notes = 'Tax Commissioner "Excess Funds - All Years" PDF. The HTML landing page times out from our egress, but the document URL itself downloads fine — confirmed 2026-08-15: 64 rows totalling $2,334,164.43. Parcel number and amount held are reliable. The extracted text runs the former owner and the situs address together with no separator, so both are kept in raw rather than guessed apart, and the clerk prints only the sale month and year, so sale_date stays null.',
  updated_at = now()
where county_name = 'Gwinnett' and state = 'GA';