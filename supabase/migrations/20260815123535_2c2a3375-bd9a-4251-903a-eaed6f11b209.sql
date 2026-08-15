insert into public.surplus_county_pages
 (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1, clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md, latitude, longitude, verified_at, published)
values
 ('GA','ga-douglas','Douglas','douglas','Douglas County Tax Commissioner',
  '6200 Fairburn Road','Douglasville','30134','(770) 920-7272',
  'https://douglastax.org/excess-funds/',
  'Douglas County publishes a single "Tax Sales 2000-Forward Overage" PDF covering every tax sale since 2000, with a CLAIMED column the Tax Commissioner keeps up to date. We only list the balances marked as still unclaimed, so anything already paid out or turned over to the Georgia Department of Revenue is left off.

Excess funds are held by the Tax Commissioner and paid in the order of priority set by O.C.G.A. 48-4-5: the record owner at the time of sale, then lienholders, then other parties of interest. Georgia gives the Tax Commissioner the right to interplead disputed funds into Superior Court, and unclaimed balances are eventually reported to the state as unclaimed property, so timing matters.

To claim, submit a written claim to the Tax Commissioner''s office with proof of your interest in the property as of the sale date — deed or lien documentation, photo ID, and, for an estate, letters of administration or testamentary. Confirm the current requirements and the exact balance with the Tax Commissioner before filing; the published amount can change once fees or competing claims are applied.',
  33.7515, -84.7477, '2026-08-15', true),
 ('GA','ga-gwinnett','Gwinnett','gwinnett','Gwinnett County Tax Commissioner',
  '75 Langley Drive','Lawrenceville','30046','(770) 822-8800',
  'https://www.gwinnetttaxcommissioner.com/property-tax/delinquent-tax/excess-funds',
  'Gwinnett County publishes an "Excess Funds - All Years" PDF maintained by the Tax Commissioner''s delinquent tax division. Every Gwinnett figure we show is read straight from that document: the parcel number, the amount of excess funds being held, and the month of the tax sale. The Tax Commissioner prints the former owner and the property address together in one column, so we keep that line exactly as published rather than guessing where the name ends.

Under O.C.G.A. 48-4-5 the funds go to the record owner at the time of the sale first, then to lienholders and other parties of interest in order of priority. Gwinnett may interplead contested funds into Superior Court, and long-unclaimed balances are turned over to the State of Georgia as unclaimed property.

To claim, file a written claim with the Tax Commissioner including proof of your interest as of the sale date, photo ID, and estate paperwork where an owner is deceased. Verify the amount and the current filing requirements with the Tax Commissioner before you file — the published figure can change once fees and competing claims are applied.',
  33.9560, -84.0230, '2026-08-15', true)
on conflict do nothing;