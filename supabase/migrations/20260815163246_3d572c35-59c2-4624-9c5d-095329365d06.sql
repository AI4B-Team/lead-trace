INSERT INTO public.agency_contacts (agency_name, department, jurisdiction, county_name, state, contact_title, email, record_types, response_format, notes)
VALUES (
  'Hernando County Clerk of Circuit Court & Comptroller',
  'Public Records',
  'county',
  'Hernando',
  'FL',
  'Public Records Custodian',
  'publicrecordsrequest@hernandoclerk.org',
  ARRAY['surplus_funds'],
  'spreadsheet',
  'Address published by the clerk on its own public-records page (verified 2026-08-15). Surplus list is not crawlable; served through the records-request path.'
)
ON CONFLICT DO NOTHING;