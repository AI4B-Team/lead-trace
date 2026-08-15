-- Columbia County GA guide page. Contact verified 2026-08-15 from the Tax
-- Commissioner's own site. County key follows the 'ga-<slug>' convention used by
-- the ingested records, so the page joins its live rows.
INSERT INTO public.surplus_county_pages
  (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1,
   clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md,
   verified_at, published)
VALUES
  ('GA','ga-columbia','Columbia','columbia','Columbia County Tax Commissioner','630 Ronald Reagan Drive','Evans, GA','30809','706-868-3375',
   'https://www.weissman.law/specialties/excess-tax-funds/',
   'Columbia County tax sale overage is held by the Tax Commissioner, with excess-funds records administered by the firm the office retains for that work. Balances here come from that firm''s Columbia County list, refreshed about twice a month.

**How to claim**

1. Confirm you are an eligible claimant under O.C.G.A. 48-4-5 — the former owner of record at the time of sale, or a lienholder of record, in the priority the statute sets.
2. Contact the Tax Commissioner at 706-868-3375 or 630 Ronald Reagan Drive, Evans, for the claim packet, and identify the parcel number and sale date exactly as listed.
3. Provide proof of identity and of your recorded interest — deed, security deed, or lien — plus estate paperwork for heir claims.
4. Competing claims go to Superior Court by interpleader; rows shown as "claim filed" already have a petition pending and are excluded from the unclaimed list.
5. Filing your own claim is free. Any recovery help is optional and must state its fee in writing.',
   current_date, true)
ON CONFLICT (state, slug) DO NOTHING;