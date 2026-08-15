-- Florida surplus counties routed to the public-records-request path.
-- Evidence: reports/fl-surplus-clerk-primary-2026-08-15.md and
-- reports/fl-clerk-waf-2026-08-15.md — each clerk below either publishes no
-- machine-readable held-surplus list (image PDFs, claim forms, sale notices
-- only) or refuses automated reads outright. status='manual' keeps them out of
-- customer-facing scrape sweeps while the request engine works them.

INSERT INTO public.surplus_sources (county_name, state, sale_kind, handler, source_url, refresh_cadence, status, notes)
VALUES
  ('Clay','FL','tax_deed','records_request','https://www.clayclerk.com/','monthly','manual','Probed 2026-08-15: "Unclaimed Funds List" PDF is a single embedded screenshot image (no text layer, confirmed with pdftotext/pdfimages). Records request is the only machine-readable path.'),
  ('St. Lucie','FL','tax_deed','records_request','https://stlucieclerk.gov/services/unclaimed-funds','monthly','manual','Probed 2026-08-15: unclaimed-funds page publishes claim forms only, no list of held balances.'),
  ('Collier','FL','tax_deed','records_request','https://www.collierclerk.com/','monthly','manual','Probed 2026-08-15: "Unclaimed Monies" page times out on repeated fetches and publishes no downloadable list.'),
  ('Bay','FL','tax_deed','records_request','https://www.baycoclerk.com/','monthly','manual','Probed 2026-08-15: tax deed page links a surplus claim form only (rejected by doc-classify as a form, not a list).'),
  ('Okaloosa','FL','tax_deed','records_request','https://www.okaloosaclerk.com/','monthly','manual','Probed 2026-08-15: claim form only, no published list of held surplus.'),
  ('Nassau','FL','tax_deed','records_request','https://www.nassauclerk.com/','monthly','manual','Probed 2026-08-15: publishes sale notices only; no surplus balances.'),
  ('Charlotte','FL','tax_deed','records_request','https://www.charlotteclerk.com/','monthly','manual','Probed 2026-08-15: robots.txt disallows the tax deed path, so no automated read is permitted. Records request instead.'),
  ('Duval','FL','tax_deed','records_request','https://www.duvalclerk.com/','monthly','manual','Reopened through the residential proxy 2026-08-15 but publishes claim instructions and forms only, no list.'),
  ('Leon','FL','tax_deed','records_request','https://cvweb.leonclerk.com/','monthly','manual','Reopened through the residential proxy 2026-08-15; only PDF on the page is unclaimed_funds_form.pdf (a form).'),
  ('Lee','FL','tax_deed','records_request','https://www.leeclerk.org/','monthly','manual','403 to both datacenter and residential IPs 2026-08-15 (TLS/browser fingerprinting). Not readable by automation.'),
  ('Lake','FL','tax_deed','records_request','https://www.lakecountyclerk.org/','monthly','manual','403 to both datacenter and residential IPs 2026-08-15. Not readable by automation.'),
  ('Escambia','FL','tax_deed','records_request','https://www.escambiaclerk.com/','monthly','manual','403 to both datacenter and residential IPs 2026-08-15. Not readable by automation.'),
  ('Highlands','FL','tax_deed','records_request','https://www.hcclerk.org/','monthly','manual','403 to both datacenter and residential IPs 2026-08-15. Not readable by automation.')
ON CONFLICT (state, county_name, sale_kind) DO UPDATE
  SET handler = EXCLUDED.handler,
      source_url = EXCLUDED.source_url,
      refresh_cadence = EXCLUDED.refresh_cadence,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      updated_at = now();

-- Pasco and Pinellas were parked on the RealAuction handler, which can never
-- serve them (vendor-wide robots disallow + clerk WAF). Move them to the same
-- request path rather than retrying a source we are not permitted to read.
UPDATE public.surplus_sources
   SET handler = 'records_request',
       status = 'manual',
       refresh_cadence = 'monthly',
       notes = 'Moved to the public-records-request path 2026-08-15: RealAuction disallows automation site-wide and the clerk page publishes no list (Pasco''s "Annual Unclaimed Funds Publication" page carries no data rows).',
       updated_at = now()
 WHERE state = 'FL' AND county_name IN ('Pasco','Pinellas') AND sale_kind = 'tax_deed';

-- Records-custodian contacts discovered from the clerks' own public pages
-- (scripts/discover-fl-clerk-contacts.ts). These are general clerk mailboxes,
-- flagged as such in notes; the request engine still throttles to one request
-- per agency per cycle. No address here is invented.
INSERT INTO public.agency_contacts (agency_name, department, county_name, state, email, record_types, responsive, response_format, notes)
SELECT * FROM (VALUES
  ('Clay County Clerk of Court','Public Records','Clay','FL','clayarchives@clayclerk.com', ARRAY['surplus_funds'], false, 'unknown', 'General records/archives mailbox found on the clerk site 2026-08-15. Not a confirmed surplus custodian — verify on first reply.'),
  ('Collier County Clerk of the Circuit Court','Public Records','Collier','FL','collierclerk@collierclerk.com', ARRAY['surplus_funds'], false, 'unknown', 'General clerk mailbox found on the clerk site 2026-08-15. Not a confirmed surplus custodian — verify on first reply.')
) AS v(agency_name, department, county_name, state, email, record_types, responsive, response_format, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.agency_contacts a
   WHERE a.state = v.state AND a.county_name = v.county_name AND lower(a.email) = lower(v.email)
);