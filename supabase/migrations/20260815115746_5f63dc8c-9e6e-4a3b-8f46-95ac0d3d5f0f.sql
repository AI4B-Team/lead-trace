insert into public.surplus_sources (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
values (
  'Osceola','FL','tax_deed','pdf_list',
  'https://courts.osceolaclerk.com/reports/TaxDeedsSurplusFundsAvailableWeb.pdf',
  jsonb_build_object(
    'columns', jsonb_build_array('case_number','certificate_number','confirmed_amount','claimant_name','parcel_apn'),
    'rowPattern','^(\d{1,4}-\d{4})\s+(\d{6,10})\s+\$([\d,]+\.\d{2})\s*(.*?)\s*(\d{9,20})$',
    'groupPattern','^(\d{2}/\d{2}/\d{4})$',
    'groupField','sale_date',
    'defaultClaimStatus','unclaimed',
    'skipLines', jsonb_build_array('Tax Deeds Surplus Funds Available','Report Date','AMOUNT AVAILABLE IS SUBJECT TO CHANGE','Report Dates','All Dates Through','Sale Date','Clerk of the Circuit Court')
  ),
  'daily','live',
  'Clerk publishes a live "Tax Deeds Surplus Funds Available" PDF; sale dates print as group headers above their rows.'
)
on conflict (county_name, state, sale_kind) do update
set handler = excluded.handler,
    source_url = excluded.source_url,
    fetch_config = excluded.fetch_config,
    refresh_cadence = excluded.refresh_cadence,
    status = excluded.status,
    notes = excluded.notes;