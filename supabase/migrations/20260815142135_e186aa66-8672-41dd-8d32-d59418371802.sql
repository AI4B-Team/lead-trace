-- Guide pages for two more Georgia counties. Contact details verified 2026-08-15
-- from each Tax Commissioner's own site. Neither county publishes its own excess
-- funds page, so the official list link points at the escrow administrator's
-- index page, which is where the county's list actually lives.
INSERT INTO public.surplus_county_pages
  (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1,
   clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md,
   verified_at, published)
VALUES
  ('GA','13185','Lowndes','lowndes','Lowndes County Tax Commissioner','300 N. Patterson Street','Valdosta, GA','31601','229-671-2579',
   'https://www.weissman.law/specialties/excess-tax-funds/',
   'Lowndes County''s tax sale overage is held by the Tax Commissioner, and the county''s excess-funds records are administered by the firm the office retains for that work. Balances here come from that firm''s Lowndes County list, refreshed about twice a month. A large share of Lowndes rows already show as "claim filed" — those funds are before Superior Court on an interpleader, not sitting unclaimed.

**How to claim**

1. Confirm you are an eligible claimant under O.C.G.A. 48-4-5 — the former owner of record at the time of sale, or a lienholder of record, in the priority the statute sets.
2. Request the claim packet from the Tax Commissioner''s office at 300 N. Patterson Street, Valdosta, and cite the parcel number and sale date exactly as listed.
3. Provide proof of identity and of your recorded interest — deed, security deed, or lien — plus estate paperwork if you are claiming as an heir.
4. If more than one party claims the same funds, the holder deposits the money with Superior Court and a judge decides. Rows marked "claim filed" already have a petition pending.
5. Filing your own claim is free. Recovery help is optional and must put its fee in writing.',
   current_date, true),
  ('GA','13157','Jackson','jackson','Jackson County Tax Commissioner','4965 Jackson Parkway','Jefferson, GA','30549','(706) 367-6325',
   'https://www.weissman.law/specialties/excess-tax-funds/',
   'Jackson County holds tax sale excess funds through the Tax Commissioner, with excess-funds records administered by the firm the office retains. Balances here come from that firm''s Jackson County list, refreshed about twice a month.

**How to claim**

1. Confirm you are an eligible claimant under O.C.G.A. 48-4-5 — former owner of record at the time of sale, or a lienholder of record, in statutory priority.
2. Call the Property Tax division at (706) 367-6325 or visit 4965 Jackson Parkway, Jefferson, for the claim packet, and identify the parcel and sale date exactly as listed.
3. Provide proof of identity and of your recorded interest, plus estate documents for heir claims.
4. Competing claims are resolved by interpleader in Superior Court; rows marked "claim filed" already have a petition on file.
5. Filing your own claim is free.',
   current_date, true)
ON CONFLICT (state, slug) DO NOTHING;