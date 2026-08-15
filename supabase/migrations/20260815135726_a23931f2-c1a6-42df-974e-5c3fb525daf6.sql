-- Fulton's own excess-funds page is behind a challenge that blocks server
-- fetches, so the row sat 'broken' and the earlier registration was skipped as a
-- duplicate. The Tax Commissioner's retained escrow administrator publishes the
-- same figures in a fetchable workbook, so point the existing row there.
UPDATE public.surplus_sources
SET handler = 'xlsx_list',
    source_url = 'https://www.weissman.law/wp-content/uploads/2026/08/Fulton.xlsx',
    status = 'live',
    refresh_cadence = 'biweekly',
    fetch_config = jsonb_build_object(
      'indexUrl', 'https://www.weissman.law/specialties/excess-tax-funds/',
      'linkPattern', '/Fulton\.xlsx$',
      'claimFiledWhenPresent', 'Petition Filed Date',
      'defaultClaimStatus', 'unclaimed',
      'columnMap', jsonb_build_object(
        'Matter Id', 'case_number',
        'Parcel No.', 'parcel_apn',
        'Owner', 'claimant_name',
        'Address', 'property_address',
        'Sale Date', 'sale_date',
        'Excess Funds', 'confirmed_amount'
      )
    ),
    notes = 'County excess-funds page is Cloudflare-blocked to server fetches, so this reads the workbook published by the firm the Tax Commissioner retained to administer excess funds. Verified 2026-08-15: 31 money rows, $681,712.43 held.',
    updated_at = now()
WHERE state = 'GA' AND county_name = 'Fulton';

INSERT INTO public.surplus_county_pages
  (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1,
   clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md,
   verified_at, published)
VALUES
  ('GA','13121','Fulton','fulton','Fulton County Tax Commissioner','141 Pryor St. SW','Atlanta, GA','30303','404-613-6100',
   'https://fultoncountytaxes.org/property-taxes/excess-funds.aspx',
   'Fulton County holds tax sale excess funds through the Tax Commissioner, and the county''s excess-funds records are administered by the outside firm it retains for that work. Balances shown here come from that firm''s published county workbook, refreshed about twice a month.

**How to claim**

1. Confirm you are an eligible claimant under O.C.G.A. 48-4-5 — the former owner of record at the time of sale, or a lienholder of record, in the priority the statute sets.
2. Request the claim packet from the Tax Commissioner''s office or the administering firm named on the county''s excess funds page, and identify the parcel and sale date exactly as listed.
3. Provide proof of identity and of your interest: recorded deed, security deed, lien, or estate documents if you are claiming as an heir or executor.
4. Expect an interpleader if more than one party claims the same funds — the holder then deposits the money with Superior Court and a judge decides. A row marked "claim filed" here already has a petition pending.
5. There is no fee to file your own claim. Anyone offering to recover the money for a share of it is optional and must disclose their terms in writing.',
   current_date, true),
  ('GA','13217','Newton','newton','Newton County Tax Commissioner','1113 Usher St NE, Suite 101','Covington, GA','30014','770-784-2020',
   'https://newtoncountytax.com/',
   'Newton County''s tax sale overage is held by the Tax Commissioner, with excess-funds records administered by the firm the office retains for that purpose. Balances here come from that firm''s Newton County workbook, refreshed about twice a month.

**How to claim**

1. Confirm you are an eligible claimant under O.C.G.A. 48-4-5 — the former owner of record at the time of sale, or a lienholder of record, in statutory priority.
2. Request the claim packet from the Tax Commissioner''s office at 1113 Usher St NE, Suite 101, Covington, and cite the parcel number and sale date as listed.
3. Provide proof of identity and of your recorded interest, plus estate paperwork if you are claiming as an heir.
4. Competing claims go to interpleader in Superior Court; rows marked "claim filed" here already have a petition on file.
5. Filing your own claim is free.',
   current_date, true),
  ('GA','13215','Muscogee','muscogee','Muscogee County Tax Commissioner','3111 Citizens Way','Columbus, GA','31906','(706) 653-4211',
   'https://www.columbusga.gov/taxcommissioner/',
   'Columbus-Muscogee County holds tax sale excess funds through the Tax Commissioner''s Property/Delinquent Tax Office, with excess-funds records administered by the firm the office retains. Balances here come from that firm''s Muscogee County workbook, refreshed about twice a month.

**How to claim**

1. Confirm you are an eligible claimant under O.C.G.A. 48-4-5 — former owner of record at the time of sale, or a lienholder of record, in statutory priority.
2. Contact the Property/Delinquent Tax Office at (706) 653-4211 for the claim packet, and identify the parcel and sale date exactly as listed.
3. Provide proof of identity and of your recorded interest, plus estate documents for heir claims.
4. Competing claims are resolved by interpleader in Superior Court; rows marked "claim filed" here already have a petition pending.
5. Filing your own claim is free.',
   current_date, true)
ON CONFLICT (state, slug) DO NOTHING;