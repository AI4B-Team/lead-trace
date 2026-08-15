insert into public.surplus_sources
  (county_name, state, sale_kind, handler, source_url, fetch_config, refresh_cadence, status, notes)
values (
  'DeKalb', 'GA', 'tax_deed', 'pdf_list',
  'https://dekalbtaxga.gov/wp-content/uploads/Excess-Funds-List.pdf',
  jsonb_build_object(
    'columns', jsonb_build_array('parcel_apn','confirmed_amount','sale_date','claimant_name','property_address','zip'),
    'rowPattern', '^([0-9]{2} [0-9]{3} [0-9]{2} [0-9]{3,4}[A-Z]?) \$([0-9,]+\.[0-9]{2}) ([0-9]{1,2}/[0-9]{1,2}/[0-9]{4}) ([A-Z][A-Z .,&/''-]*?) ([0-9]+ .+?) [`'']?([0-9]{5})$',
    'skipLines', jsonb_build_array('PARCEL ID','As of','EXCESS FUNDS')
  ),
  'weekly', 'live',
  'Tax Commissioner Excess Funds list (PDF, as-of dated). Pattern human-verified 2026-08-15 against live PDF: 226 of 227 money lines parse, $6.61M total. Carries owner name + situs address.'
);

insert into public.source_coverage (fips, state, county_name, record_type, status, verified_at, sample_row_count)
values ('13089', 'GA', 'DeKalb', 'surplus_funds', 'verified', now(), 0)
on conflict do nothing;

insert into public.surplus_statutes
  (state, sale_kind, statute_citation, source_url, recovery_permitted, published, notes, verified_by, verified_at)
values (
  'GA', 'tax_deed', 'O.C.G.A. § 48-4-5',
  'https://law.justia.com/codes/georgia/title-48/chapter-4/article-1/section-48-4-5/',
  true, false,
  'Georgia excess funds after tax sale. Claim window / escheat timing intentionally left null pending human verification; do not surface deadlines for GA until confirmed.',
  'agent-draft', now()
);