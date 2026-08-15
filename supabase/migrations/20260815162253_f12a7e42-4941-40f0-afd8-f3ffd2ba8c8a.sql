-- Sumter: correct the URL to the clerk's dedicated tax deed overbids page.
-- Re-probed 2026-08-15 in a real browser: the page is reachable and states
-- "There are no properties on the tax deed surplus list at this time." — an
-- honest empty list, not a block. Stays unverified until rows appear so the
-- column map can be confirmed against live headers.
update public.surplus_sources
set source_url = 'https://www.sumterclerk.com/public-records/tax-deeds/tax-deed-overbids/',
    refresh_cadence = 'monthly',
    last_checked_at = now(),
    notes = 'Re-probed 2026-08-15: clerk publishes a dedicated Tax Deed Surplus page that currently reads "There are no properties on the tax deed surplus list at this time." Source is honest and reachable; hold at unverified until real rows appear, then confirm headers and add columnMap before promoting to live.',
    updated_at = now()
where state = 'FL' and county_name = 'Sumter';

-- Counties re-probed 2026-08-15 that publish no machine-readable surplus list.
-- Crawling them will never yield data, so move them onto the public-records
-- request path where a custodian address makes them actionable.
update public.surplus_sources
set handler = 'records_request',
    status = 'manual',
    refresh_cadence = 'monthly',
    consecutive_failures = 0,
    last_checked_at = now(),
    notes = coalesce(notes, '') || ' Moved to the public-records-request path 2026-08-15 after a second browser probe confirmed no published list of held balances (claim instructions and forms only, or a list frozen years out of date). Needs a records custodian address before the monthly request can be sent.',
    updated_at = now()
where state = 'FL'
  and status = 'unverified'
  and county_name in ('Brevard','Citrus','Hernando','Polk','Sarasota','Volusia');