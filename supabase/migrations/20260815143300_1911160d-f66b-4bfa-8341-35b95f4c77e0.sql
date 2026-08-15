-- 'policy_blocked' = we are not allowed to collect this source, as distinct from
-- 'failed' (broken, retry) and 'disabled' (we chose to pause it).
ALTER TABLE public.data_sources DROP CONSTRAINT data_sources_status_check;
ALTER TABLE public.data_sources ADD CONSTRAINT data_sources_status_check
  CHECK (status = ANY (ARRAY[
    'discovered','pending_verification','verified','enabled',
    'disabled','failed','rejected','policy_blocked'
  ]));

-- The RealAuction platform (realtaxdeed.com / realforeclose.com) serves a blanket
-- "Disallow: /" robots.txt for all user agents as of 2026-08-05, which is the last
-- date any of these sources pulled successfully. Crawling them is off the table by
-- policy, so retire them instead of leaving them 'verified' and failing nightly.
UPDATE public.data_sources
SET status = 'policy_blocked',
    last_error = 'Retired 2026-08-15: vendor robots.txt is a site-wide "Disallow: /" for all agents. Crawling is not permitted; supply this county through a clerk-primary or records-request path.',
    updated_at = now()
WHERE state = 'FL'
  AND platform = 'html_search'
  AND (domain LIKE '%.realtaxdeed.com' OR domain LIKE '%.realforeclose.com')
  AND status IN ('verified', 'discovered', 'failed');