INSERT INTO public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
VALUES
  (
    'Marion', 'FL', 'tax_deed', 'pdf_list',
    'https://www.marioncountyclerk.org/uploads/2026/08/Copy-of-Tax-Deeds-Surplus-Funds-2026-08-07.pdf',
    jsonb_build_object(
      'columns', jsonb_build_array('case_number','sale_date','tax_number','parcel_apn','confirmed_amount'),
      'rowPattern', '^(\d{4,}[A-Z]?)\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\S+)\s+([\d,]+\.\d{2})$',
      'skipLines', jsonb_build_array(
        'Tax Deeds Surplus Funds Report', 'Report run on', 'Sale number Sale date', 'Grand Total', 'Page '
      ),
      'resolveLatestFrom', 'https://www.marioncountyclerk.org/departments/records-recording/tax-deeds-and-lands-available-for-taxes/unclaimed-funds/',
      'linkMatch', 'surplus'
    ),
    'monthly', 'live',
    'Config human-confirmed 2026-08-13 vs live PDF via real unpdf handler path (645 rows, 0 unmatched). Latest-PDF resolver follows the stable clerk landing page, so source_url is only a fallback. List carries no owner name (enrich parcel->owner later).'
  ),
  (
    'Sumter', 'FL', 'tax_deed', 'html_table',
    'https://www.sumterclerk.com/tax-deed-sales',
    '{}'::jsonb,
    'weekly', 'unverified',
    'Candidate only. Structure confirmed correct at probe but the overbid table was empty (no active sales). Confirm live headers before adding columnMap and promoting.'
  )
ON CONFLICT (state, county_name, sale_kind) DO NOTHING;

UPDATE public.surplus_sources
   SET status = 'live'
 WHERE state = 'FL' AND county_name = 'Marion' AND handler = 'pdf_list';

UPDATE public.surplus_statutes
   SET claim_window_days = 120,
       window_starts_from = 'sale_date',
       escheat_days = 120,
       escheat_starts_from = 'sale_date',
       escheat_destination = 'Florida Dept of Financial Services (Unclaimed Property, Ch. 717)',
       fee_cap_pct = 12,
       requires_finder_license = false,
       assignment_permitted = true,
       verified_at = now(),
       verified_by = 'manual: flsenate.gov 197.582 / 45.033',
       published = true,
       source_url = COALESCE(source_url, 'https://www.flsenate.gov/Laws/Statutes/2024/197.582')
 WHERE state = 'FL' AND sale_kind = 'tax_deed' AND statute_citation = 'Fla. Stat. 197.582';