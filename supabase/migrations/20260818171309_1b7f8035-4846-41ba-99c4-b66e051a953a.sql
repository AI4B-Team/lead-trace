-- FL priority-6 surplus batch, probed 2026-08-19 (reports/fl-priority-6-2026-08-19.md).
-- Hillsborough and Osceola are already live and are deliberately untouched.

-- PASCO — the one gap county that turned out to publish a real machine-readable
-- list. It is NOT on the clerk's "Annual Unclaimed Funds Publication" page (that
-- page carries no rows, which is why the 2026-08-15 pass parked Pasco on
-- records_request); it lives on the clerk's separate public reports app:
--   http://app.pascoclerk.com/appdot-public-statistical-reports-taxdeeds.asp
--     -> "Unclaimed Tax Deed Surplus 20260731.xlsx"  (updated 8/11/2026)
-- The filename carries the publish date and rotates, so indexUrl + linkPattern
-- resolve the current workbook instead of pinning a URL that dies next month.
-- The affidavit PDF next to it is a claim form and is excluded by linkPattern.
--
-- Layout human-confirmed against the live file 2026-08-19. The workbook appends
-- a NEW tab per month (OCT 25 ... JUL 26), each a fresh snapshot of what is
-- still held, so sheetMode='last' follows the clerk's own append order rather
-- than hard-coding a month that goes stale. Header row 5:
--   DATE RECEIVED | TDA # | ORIGINAL OWNER | PARCEL ID # | ACTUAL BALANCE
--   | DATE PAID | AMOUNT PAID | BALANCE
-- Mapping decisions, none guessed:
--   TDA #          -> case_number   (also requirePresent: drops title/total rows)
--   PARCEL ID #    -> parcel_apn
--   ORIGINAL OWNER -> claimant_name
--   ACTUAL BALANCE -> confirmed_amount
--   DATE PAID      -> skipWhenPresent (money already disbursed has left the office)
--   DATE RECEIVED is the date the clerk RECEIVED the funds, not the sale date, so
--   sale_date stays null and the value is kept in raw. The list publishes no
--   property address, so that stays null too.
-- Verified through the production xlsx_list handler: 73 parsed / 73 with a
-- positive amount / 73 unique doc_numbers (0 dupes) / $592,789.59 held.
UPDATE public.surplus_sources
SET handler = 'xlsx_list',
    source_url = 'http://app.pascoclerk.com/appdot-public-statistical-reports-taxdeeds.asp',
    fetch_config = jsonb_build_object(
      'indexUrl', 'http://app.pascoclerk.com/appdot-public-statistical-reports-taxdeeds.asp',
      'linkPattern', 'Unclaimed.*Surplus.*\.xlsx',
      'sheetMode', 'last',
      'headerRow', 5,
      'requirePresent', 'TDA #',
      'skipWhenPresent', 'DATE PAID',
      'defaultClaimStatus', 'unclaimed',
      'columnMap', jsonb_build_object(
        'TDA #', 'case_number',
        'PARCEL ID #', 'parcel_apn',
        'ORIGINAL OWNER', 'claimant_name',
        'ACTUAL BALANCE', 'confirmed_amount'
      )
    ),
    refresh_cadence = 'monthly',
    status = 'live',
    consecutive_failures = 0,
    notes = 'Clerk public reports app publishes "Unclaimed Tax Deed Surplus YYYYMMDD.xlsx" (a new monthly tab per snapshot; latest tab is current). Columns human-confirmed 2026-08-19 against the live file: DATE RECEIVED | TDA # | ORIGINAL OWNER | PARCEL ID # | ACTUAL BALANCE | DATE PAID | AMOUNT PAID | BALANCE. 73 held balances totalling $592,789.59. DATE RECEIVED is a receipt date, not a sale date, so sale_date stays null; no property address is published. Rows with DATE PAID filled are dropped (already disbursed). Filename rotates monthly; indexUrl + linkPattern resolve the current workbook.'
WHERE state = 'FL' AND county_name = 'Pasco';

-- PINELLAS — mypinellasclerk.gov now answers HTTP 403 to a plain
-- robots-respecting GET on the root and on every tax-deed / unclaimed path. A
-- managed challenge is never worked around, so the county stays on the
-- records-request path.
UPDATE public.surplus_sources
SET status = 'manual',
    handler = 'records_request',
    notes = 'Re-probed 2026-08-19: mypinellasclerk.gov returns HTTP 403 to a plain robots-respecting GET (root and all tax-deed/unclaimed paths), and pinellas.realtaxdeed.com disallows automation site-wide in robots.txt. No machine-readable list is reachable without bypassing a WAF, which we do not do. Stays on the public-records-request path; needs a records custodian address.'
WHERE state = 'FL' AND county_name = 'Pinellas';

-- POLK — the clerk's only tax-deed page (polkclerkfl.gov/189/Tax-Deeds, the
-- single surplus-relevant entry in its sitemap) links a "Statement of Claim" and
-- a "Request For Reinstatement" form. Both are claim paperwork, not data.
-- polk.realtaxdeed.com is now robots-disallowed, so the earlier
-- "robots-allowed" note no longer holds.
UPDATE public.surplus_sources
SET status = 'manual',
    handler = 'records_request',
    notes = 'Re-probed 2026-08-19: polkcountyclerk.net/polkclerkfl.gov sitemap carries exactly one surplus-relevant page (/189/Tax-Deeds); it publishes only claim paperwork (Statement-of-Claim.pdf, Request-For-Reinstatement-Tax-Deeds.pdf) and no list of held balances. polk.realtaxdeed.com is disallowed by robots.txt, so the RealTaxDeed side is not collectable either. Stays on the public-records-request path.'
WHERE state = 'FL' AND county_name = 'Polk';

-- ORANGE — had no surplus_funds source row at all (Orange is live only as code
-- violations, a different record type). The Comptroller, not the Clerk, is the
-- tax-deed custodian; its whole sitemap carries five surplus-relevant pages and
-- none is a list of held tax-deed money:
--   /191 Tax-Deed-Sales + /194 FAQ  -> sale process, no balances
--   /276 Unclaimed-Property         -> claim instructions only
--   /160, /197 Surplus ...          -> surplus EQUIPMENT and VEHICLES, not funds
-- orange.realtaxdeed.com is robots-disallowed. Recorded as records_request so a
-- later sweep does not re-derive the same refusal.
INSERT INTO public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
SELECT 'Orange', 'FL', 'tax_deed', 'records_request',
       'https://www.occompt.com/191/Tax-Deed-Sales', '{}'::jsonb, 'monthly', 'manual',
       'Probed 2026-08-19: Orange County Comptroller is the tax-deed custodian. Its sitemap carries five surplus-relevant pages and none publishes held tax-deed balances (/191 + /194 describe the sale process, /276 Unclaimed Property is claim instructions, /160 and /197 are surplus equipment and vehicles). orange.realtaxdeed.com is disallowed by robots.txt. No machine-readable list exists; use the public-records-request path.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.surplus_sources WHERE state = 'FL' AND county_name = 'Orange' AND sale_kind = 'tax_deed'
);