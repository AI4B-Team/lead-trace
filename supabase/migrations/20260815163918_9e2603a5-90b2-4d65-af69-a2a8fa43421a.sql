INSERT INTO public.agency_contacts (agency_name, department, jurisdiction, county_name, state, contact_title, email, record_types, response_format, notes)
VALUES
(
  'Charlotte County Clerk of Circuit Court & Comptroller',
  'Tax Deeds',
  'county',
  'Charlotte',
  'FL',
  'Tax Deeds Department',
  'taxdeeds@charlotteclerk.com',
  ARRAY['surplus_funds'],
  'spreadsheet',
  'Address published by the clerk on its own tax deeds page (verified 2026-08-15). Surplus list is not crawlable; served through the records-request path.'
),
(
  'Duval County Clerk of Courts',
  'Finance and Accounting',
  'county',
  'Duval',
  'FL',
  'Finance Department (Unclaimed Funds)',
  'finance.clerk@duvalclerk.com',
  ARRAY['surplus_funds'],
  'spreadsheet',
  'Address published by the clerk on its own unclaimed funds page (verified 2026-08-15). Surplus list is not crawlable; served through the records-request path.'
),
(
  'Nassau County Clerk of Courts & Comptroller',
  'Public Records',
  'county',
  'Nassau',
  'FL',
  'Public Records Custodian',
  'publicrecordsreq@nassauclerk.com',
  ARRAY['surplus_funds'],
  'spreadsheet',
  'Address published by the clerk on its own public records request page (verified 2026-08-15). Surplus list is not crawlable; served through the records-request path.'
)
ON CONFLICT DO NOTHING;