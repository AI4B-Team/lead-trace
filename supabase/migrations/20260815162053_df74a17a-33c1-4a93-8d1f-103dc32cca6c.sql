update public.surplus_sources
set handler = 'records_request',
    status = 'manual',
    refresh_cadence = 'monthly',
    consecutive_failures = 0,
    last_checked_at = now(),
    notes = 'Moved to the public-records-request path 2026-08-15: county WAF returns a hard block to every automated path we can use. Verified this date — Clayton serves a Sucuri JavaScript challenge and Cobb answers 403 even from a real headless browser; the residential proxy cannot reach .gov hostnames at all (tunnel refused), so no crawl route exists. Needs a records custodian address before the monthly request can be sent.',
    updated_at = now()
where state = 'GA' and status = 'broken' and county_name in ('Clayton','Cobb');