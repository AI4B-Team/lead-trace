insert into public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
values
 ('Brevard','FL','tax_deed','pdf_list',
  'https://www.brevardclerk.us/?a=Files.Serve&File_id=043B35C9-B5A4-433D-A012-C2C82D5E44CF',
  jsonb_build_object('columns', jsonb_build_array('sale_date','doc_number','confirmed_amount','claim_status'),
                     'rowPattern','^([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})\s+([0-9]{6})\s+\$?\s*([0-9,]+\.[0-9]{2})$',
                     'skipLines', jsonb_build_array('OVERBID - TAX DEED SALE','SALE','DATE','TDF#')),
  'monthly','unverified',
  'Clerk "Tax Deeds - Overbid" PDF. Machine-readable (sale date, TDF#, overbid amount, paid/escheat notes) but STALE: newest sale on the published list is 12/3/2020. No owner name or parcel. Do not promote to live until the clerk refreshes the file; re-probe monthly. Probed 2026-08-15.'),
 ('Cobb','GA','tax_deed','pdf_list','https://www.cobbtax.org/property/delinquent-taxes/excess-funds','{}'::jsonb,'monthly','broken',
  'Excess funds page returns 403 to datacenter IPs (WAF). No proxy allowed outside RealAuction. Revisit only if a challenge-solving path is approved. Probed 2026-08-15.'),
 ('Fulton','GA','tax_deed','pdf_list','https://fultoncountytaxes.org/property-taxes/excess-funds.aspx','{}'::jsonb,'monthly','broken',
  'Cloudflare block ("you have been blocked") on datacenter IPs, including headless Chrome. Probed 2026-08-15.'),
 ('Clayton','GA','tax_deed','pdf_list','https://www.claytoncountyga.gov/government/tax-commissioner/excess-funds/','{}'::jsonb,'monthly','broken',
  'GoDaddy Website Firewall denies datacenter IPs. Probed 2026-08-15.'),
 ('Gwinnett','GA','tax_deed','pdf_list','https://www.gwinnetttaxcommissioner.com/property-tax/delinquent-tax/excess-funds','{}'::jsonb,'monthly','broken',
  'Connection times out from our egress (no response, likely geo/bot filtering). Probed 2026-08-15.')
on conflict (state, county_name, sale_kind) do update
  set source_url = excluded.source_url,
      handler = excluded.handler,
      fetch_config = excluded.fetch_config,
      refresh_cadence = excluded.refresh_cadence,
      status = excluded.status,
      notes = excluded.notes;
