insert into public.surplus_county_pages (
  state, slug, county_name, county_fips, clerk_office_name,
  clerk_address_line1, clerk_address_line2, clerk_city, clerk_postal_code, clerk_phone,
  official_list_url, claim_process_md, published, verified_at
) values (
  'FL', 'osceola', 'Osceola', 'fl-osceola',
  'Osceola County Clerk of the Circuit Court — Tax Deeds',
  'Tax Deeds Department', '2 Courthouse Square, Suite 2000', 'Kissimmee, FL', '34741',
  '(407) 742-3500',
  'https://courts.osceolaclerk.com/reports/TaxDeedsSurplusFundsAvailableWeb.pdf',
  'Osceola County publishes a live "Tax Deeds Surplus Funds Available" report as a PDF, refreshed by the Clerk''s Tax Deeds department. Every Osceola figure we show is read from that report exactly as published: tax deed case number, tax certificate number, surplus amount available, the name the funds are recorded under, and the parcel identification number. The report groups records under the sale date they belong to, and we carry that sale date onto each record.

The Clerk states on the report itself that the amount available is subject to change, so treat every balance as the Clerk''s working figure rather than a settled payout.

To claim surplus funds, file a claim with the Clerk''s Tax Deeds department identifying the case number and parcel from the report, and attach documentation proving your interest in the property as of the tax deed application date. Government-issued identification is normally required. Confirm current forms and filing requirements with the Tax Deeds department at (407) 742-3500 before submitting anything.',
  true, now()
)
on conflict (state, slug) do update set
  county_fips = excluded.county_fips,
  clerk_office_name = excluded.clerk_office_name,
  clerk_address_line1 = excluded.clerk_address_line1,
  clerk_address_line2 = excluded.clerk_address_line2,
  clerk_city = excluded.clerk_city,
  clerk_postal_code = excluded.clerk_postal_code,
  clerk_phone = excluded.clerk_phone,
  official_list_url = excluded.official_list_url,
  claim_process_md = excluded.claim_process_md,
  published = true,
  verified_at = excluded.verified_at;