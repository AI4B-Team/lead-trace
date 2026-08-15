INSERT INTO public.surplus_sources (county_name, state, sale_kind, handler, source_url, refresh_cadence, status, notes, fetch_config)
VALUES
('Clarke', 'GA', 'tax_deed', 'pdf_list',
 'https://www.accgov.com/DocumentCenter/View/16566',
 'monthly', 'live',
 'Athens-Clarke County Tax Commissioner "Excess Tax Sale Funds" PDF, served from the county document centre at a stable document id. Confirmed 2026-08-15 against the live file (revision dated 2026-07-08): 33 of 33 money lines parse, $319,125.70 total. The list prints BID AMT, TAXES, EXCESS, CLAIMED and BALANCE; we take the BALANCE column only, so a partially claimed row shows what is still on hand rather than the original excess. Two row shapes are needed because some property descriptions carry a house number and some do not, and one pattern cannot split the defendant-in-fifa name from both without stealing part of the street address.',
 '{"columns":["sale_date","claimant_name","property_address","confirmed_amount"],"rowPatterns":["^(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+(.+?)\\s+(\\d+\\s+[^$]*?(?:Ave|St|Dr|Rd|Ln|Pkwy|Ter|Ext|Way|Ct|Blvd|Cir|Pl|Hwy|Trl)\\b[^$]*?)\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$(?:\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$)?\\s+([\\d,]+\\.\\d{2})\\$$","^(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+(.+[^\\s\\d](?<!\\b[NSEW])(?<!\\b(?:NE|NW|SE|SW)))\\s+((?:[NSEW]{1,2}\\s+)?[A-Z][A-Za-z]{2,}(?:\\s+[A-Z][A-Za-z]{2,})*\\s+(?:Ave|St|Dr|Rd|Ln|Pkwy|Ter|Ext|Way|Ct|Blvd|Cir|Pl|Hwy|Trl)\\s*\\/[^$]*?)\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$(?:\\s+\\(?[\\d,]+\\.\\d{2}\\)?\\$)?\\s+([\\d,]+\\.\\d{2})\\$$"],"skipLines":["EXCESS TAX SALE FUNDS","SALE DATE","TAX COMMISSIONER","JP LEMAY","If you have any questions"],"defaultClaimStatus":"unclaimed"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO public.surplus_county_pages
  (state, county_fips, county_name, slug, clerk_office_name, clerk_address_line1, clerk_city, clerk_postal_code, clerk_phone, official_list_url, claim_process_md, published, verified_at)
VALUES
('GA', 'ga-clarke', 'Clarke', 'clarke',
 'Athens-Clarke County Tax Commissioner', '325 E Washington St, Room 250', 'Athens, GA', '30601', '(706) 613-3120',
 'https://www.accgov.com/3910/Excess-Funds-',
 'Athens-Clarke County publishes an "Excess Tax Sale Funds" list through the Tax Commissioner''s office, covering tax sales going back to 2020. Each line shows the sale date, the defendant in fifa the funds are recorded under, the property description with its parcel number, the bid amount, the taxes owed, the excess, anything already claimed, and the balance still held.

The figures shown here are the BALANCE column only. Where part of a surplus has already been paid out, you see what the county still holds rather than the original excess, so nothing here is money the county has already released.

Excess funds are paid out in the order of priority set by O.C.G.A. 48-4-5 — the former record owner, then lienholders of record. The Tax Commissioner publishes an Excess Funds Request Form; submit it in writing with proof of your interest in the property. The office may require an affidavit and will not decide competing claims itself, and where claims compete it may interplead the money into Superior Court. Questions go to Tax Commissioner JP Lemay or Delinquent Tax Officer Emily Linares at (706) 613-3120. Unclaimed balances are eventually remitted to the Georgia Department of Revenue as unclaimed property.',
 true, CURRENT_DATE)
ON CONFLICT (state, slug) DO UPDATE SET
  county_fips = excluded.county_fips,
  clerk_office_name = excluded.clerk_office_name,
  clerk_address_line1 = excluded.clerk_address_line1,
  clerk_city = excluded.clerk_city,
  clerk_postal_code = excluded.clerk_postal_code,
  clerk_phone = excluded.clerk_phone,
  official_list_url = excluded.official_list_url,
  claim_process_md = excluded.claim_process_md,
  published = true,
  verified_at = excluded.verified_at;

INSERT INTO public.source_coverage (state, county_name, fips, record_type, status, verified_at)
VALUES ('GA', 'Clarke', '13059', 'surplus_funds', 'verified', now())
ON CONFLICT DO NOTHING;