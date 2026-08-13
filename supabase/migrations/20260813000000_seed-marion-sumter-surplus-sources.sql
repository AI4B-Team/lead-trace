-- ---------------------------------------------------------------------------
-- Seed verified clerk-published surplus sources: Marion (pdf_list) and Sumter
-- (html_table candidate). These are the FL counties whose OWN surplus lists we
-- confirmed are directly fetchable (see reports/surplus-funds-sourcing-2026-08-13.md).
--
-- Why these, not the four RealAuction proof counties already seeded: every
-- RealAuction host disallows automation in robots.txt and the big counties sit
-- behind JS-challenge bot walls a residential proxy alone cannot pass. The
-- clerk's published PDF/HTML list is the reliable path and needs no proxy.
--
-- Both rows stay 'unverified' on purpose. 'unverified' means the sweep will
-- FETCH and PARSE them but write NO customer-facing confirmations
-- (see confirm.server.ts: a non-'live' source records last_checked_at only).
-- A human promotes to 'live' after the open architecture question is resolved
-- (see notes below and HANDOVER-surplus.md).
--
-- MARION fetch_config was human-confirmed on 2026-08-13 against the live PDF
--   .../uploads/2026/08/Copy-of-Tax-Deeds-Surplus-Funds-2026-08-07.pdf
-- using the real production handler path (unpdf + parsePdfLines): 645 rows
-- parsed, 0 non-header lines unmatched. Column order in the PDF is:
--   Sale number | Sale date (YYYY-MM-DD) | Tax number | Parcel number | Current balance
-- The row regex captures all five in order; `tax_number` is intentionally not a
-- ClerkSurplusRow field, so it is ignored by toClerkRow and preserved in `raw`.
-- ---------------------------------------------------------------------------

INSERT INTO public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
VALUES
  (
    'Marion', 'FL', 'tax_deed', 'pdf_list',
    -- NOTE: this filename is DATED and rotates (monthly-ish). Before promoting
    -- to 'live', either update this URL or add a "latest PDF" resolver step —
    -- the pdf_list handler fetches source_url verbatim and will 404 once the
    -- county publishes a new dated file. See HANDOVER-surplus.md.
    'https://www.marioncountyclerk.org/uploads/2026/08/Copy-of-Tax-Deeds-Surplus-Funds-2026-08-07.pdf',
    jsonb_build_object(
      'columns', jsonb_build_array('case_number','sale_date','tax_number','parcel_apn','confirmed_amount'),
      'rowPattern', '^(\d{4,}[A-Z]?)\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\S+)\s+([\d,]+\.\d{2})$',
      'skipLines', jsonb_build_array(
        'Tax Deeds Surplus Funds Report', 'Report run on', 'Sale number Sale date', 'Grand Total', 'Page '
      ),
      -- The PDF filename rotates monthly. The clerk-primary ingest resolves the
      -- newest surplus PDF from this STABLE landing page at fetch time, so
      -- source_url above is only a fallback and never needs manual updating.
      'resolveLatestFrom', 'https://www.marioncountyclerk.org/departments/records-recording/tax-deeds-and-lands-available-for-taxes/unclaimed-funds/',
      'linkMatch', 'surplus'
    ),
    'monthly', 'unverified',
    'Config human-confirmed 2026-08-13 vs live PDF via real unpdf handler path (645 rows, 0 unmatched). Sum of balances is ~0.7% under the PDF Grand Total; both unpdf and pdfplumber agree exactly, so the gap is in the PDF text layer, not the parser. List carries no owner name (enrich parcel->owner later). Ready to promote to ''live'' once (1) source_url latest-PDF strategy is chosen and (2) the overlay-vs-primary question is resolved.'
  ),
  (
    'Sumter', 'FL', 'tax_deed', 'html_table',
    'https://www.sumterclerk.com/tax-deed-sales',
    -- No columnMap on purpose: the tax-deed overbid table was EMPTY at probe
    -- time ("no properties..."). html_table with no columnMap safely parses
    -- nothing and reports why, so this row is a placeholder awaiting live
    -- headers. Do NOT guess column meanings — a wrong dollar column ships a
    -- wrong surplus figure to a customer.
    '{}'::jsonb,
    'weekly', 'unverified',
    'Candidate only. Structure confirmed correct at probe but the overbid table was empty (no active sales). Registry Surplus PDF (dated Jul 2026) is a separate pdf_list source to add when needed. Confirm live headers before adding columnMap and promoting.'
  )
ON CONFLICT (state, county_name, sale_kind) DO NOTHING;
