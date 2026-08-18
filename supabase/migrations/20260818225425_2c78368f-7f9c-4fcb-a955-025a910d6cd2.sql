-- PASCO — the pinned headerRow was wrong for the live workbook. Each monthly tab
-- starts with a different amount of letterhead/title rows (the current "JUL 26"
-- tab carries its header on row 17, not row 5), so pinning any number breaks the
-- moment the clerk appends the next month. Dropping headerRow lets the xlsx_list
-- handler locate the header by finding the first row that carries a configured
-- column name — verified against the live file 2026-08-19 through the production
-- handler path: 73 parsed / 73 with a positive amount / $592,789.59 held.
UPDATE public.surplus_sources
SET fetch_config = (fetch_config - 'headerRow'),
    consecutive_failures = 0,
    notes = COALESCE(notes, '') || ' Header row is NOT fixed: each monthly tab carries a different number of letterhead rows (JUL 26 = row 17), so headerRow is intentionally unset and the handler auto-detects the header from the configured column names (confirmed 2026-08-19: 73 rows / $592,789.59).'
WHERE state = 'FL' AND county_name = 'Pasco' AND sale_kind = 'tax_deed';

-- SANTA ROSA — promoted live during the 2026-08-17 batch-5 pass
-- (reports/fl-surplus-batch5-2026-08-17.md) but never sealed in a migration, so a
-- fresh database lost the source row. This reproduces the confirmed config
-- exactly: clerk "Tax Deed Surplus" PDF, columns human-confirmed against the live
-- file through the real unpdf handler path (19 rows, 0 unmatched, $270,673.75).
--   FILE#   -> case_number
--   SURPLUS -> confirmed_amount
--   SALE DATE -> sale_date
--   PAYEE + mailing address -> claimant_name
-- The printed address is the PAYEE MAILING address, not the property, so
-- property_address and parcel_apn stay null rather than carrying a wrong address.
-- The filename embeds a revision date and rotates, so resolveLatestFrom follows
-- the stable landing page.
INSERT INTO public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
SELECT 'Santa Rosa', 'FL', 'tax_deed', 'pdf_list',
       'http://santarosaclerk.com/uploads/2026/07/santa-rosa-county-tax-deed-surplus-rev-04-30-2026_ADA.pdf',
       jsonb_build_object(
         'resolveLatestFrom', 'https://santarosaclerk.com/foreclosures-tax-deeds/',
         'linkMatch', 'tax.?deed.?surplus',
         'rowPattern', '^(\d{7})\s+\$\s*([\d,]+\.\d{2})\s+(\d{1,2}/\d{1,2}/\d{4})\s+(.+)$',
         'joinPattern', '^\d{7}\s+\$',
         'skipLines', jsonb_build_array('FILE# SURPLUS'),
         'columns', jsonb_build_array('case_number', 'confirmed_amount', 'sale_date', 'claimant_name'),
         'defaultClaimStatus', 'unclaimed'
       ),
       'weekly', 'live',
       'Clerk "Tax Deed Surplus" PDF. Columns human-confirmed 2026-08-17 against the live file via the real unpdf handler path: 19 rows, 0 unmatched lines, $270,673.75 held. FILE# -> case_number, SURPLUS -> confirmed_amount, SALE DATE -> sale_date, PAYEE + mailing address -> claimant_name. The published address is the payee mailing address, NOT the property, so property_address and parcel stay null. Dated filename rotates; latest-PDF resolver follows the stable foreclosures-tax-deeds landing page.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.surplus_sources
  WHERE state = 'FL' AND county_name = 'Santa Rosa' AND sale_kind = 'tax_deed'
);

-- If a placeholder/records_request row already exists on a rebuilt database,
-- bring it up to the confirmed live config (idempotent, no-op when already live).
UPDATE public.surplus_sources
SET handler = 'pdf_list',
    source_url = 'http://santarosaclerk.com/uploads/2026/07/santa-rosa-county-tax-deed-surplus-rev-04-30-2026_ADA.pdf',
    fetch_config = jsonb_build_object(
      'resolveLatestFrom', 'https://santarosaclerk.com/foreclosures-tax-deeds/',
      'linkMatch', 'tax.?deed.?surplus',
      'rowPattern', '^(\d{7})\s+\$\s*([\d,]+\.\d{2})\s+(\d{1,2}/\d{1,2}/\d{4})\s+(.+)$',
      'joinPattern', '^\d{7}\s+\$',
      'skipLines', jsonb_build_array('FILE# SURPLUS'),
      'columns', jsonb_build_array('case_number', 'confirmed_amount', 'sale_date', 'claimant_name'),
      'defaultClaimStatus', 'unclaimed'
    ),
    refresh_cadence = 'weekly',
    status = 'live'
WHERE state = 'FL' AND county_name = 'Santa Rosa' AND sale_kind = 'tax_deed'
  AND (handler <> 'pdf_list' OR status <> 'live');