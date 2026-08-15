ALTER TABLE public.surplus_sources DROP CONSTRAINT IF EXISTS surplus_sources_handler_check;
ALTER TABLE public.surplus_sources ADD CONSTRAINT surplus_sources_handler_check
  CHECK (handler IN ('html_table','pdf_list','xlsx_list','realauction_tab','open_data','records_request'));

UPDATE public.surplus_sources
SET handler = 'xlsx_list',
    status = 'live',
    refresh_cadence = 'weekly',
    source_url = 'https://www.hillsclerk.com/documents/d/guest/copy-of-weekly-tax-deed-spreadsheet-25-10-10-xlsx?download=true',
    fetch_config = jsonb_build_object(
      'sheet', 'Tax Deed',
      'headerRow', 2,
      'columnMap', jsonb_build_object('CASE NUMBER','case_number','BALANCE','confirmed_amount'),
      'defaultClaimStatus', 'unclaimed',
      'indexUrl', 'https://www.hillsclerk.com/records-and-reports/public-data-files',
      'linkPattern', 'tax-deed-spreadsheet'
    ),
    notes = 'Clerk weekly Tax Deed surplus workbook (Public Data Files page). Confirmed 2026-08-15 against the live file: as-of 08/07/2026, header row 2, 49 held balances totalling $2,996,094.47. Case number + balance only - no owner, parcel or sale date published, so those stay null. Workbook filename rotates weekly; indexUrl + linkPattern resolve the current file.',
    updated_at = now()
WHERE state = 'FL' AND county_name = 'Hillsborough' AND sale_kind = 'tax_deed';

UPDATE public.surplus_sources
SET status = 'broken',
    last_checked_at = now(),
    notes = 'Clerk tax deed page returns 403 to datacenter IPs (WAF). Probed 2026-08-15; residential proxy is reserved for RealAuction only.',
    updated_at = now()
WHERE state = 'FL' AND county_name IN ('Pasco','Pinellas') AND sale_kind = 'tax_deed';

UPDATE public.surplus_sources
SET last_checked_at = now(),
    notes = 'Probed 2026-08-15: tax deed page reachable but publishes no surplus/overbid list - claim instructions only. No machine-readable source yet.',
    updated_at = now()
WHERE state = 'FL' AND county_name = 'Polk' AND sale_kind = 'tax_deed';

INSERT INTO public.surplus_sources (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes, last_checked_at)
VALUES
  ('Hernando','FL','tax_deed','html_table','https://www.hernandoclerk.com/tax-deeds','{}'::jsonb,'monthly','unverified','Probed 2026-08-15: clerk explains the one-year hold and escheat to the FL Dept of State but publishes no surplus list. Re-probe monthly.', now()),
  ('Citrus','FL','tax_deed','html_table','https://www.citrusclerk.org/183/Tax-Deeds','{}'::jsonb,'monthly','unverified','Probed 2026-08-15: tax deed page reachable, no surplus/overbid list published. Re-probe monthly.', now())
ON CONFLICT DO NOTHING;