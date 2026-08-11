CREATE TABLE public.state_guides (
  id uuid primary key default gen_random_uuid(),
  state text not null check (char_length(state) = 2),
  record_type_slug text not null,
  published boolean not null default false,
  title text,
  intro text,
  law_sale_type text,
  law_records_holder text,
  law_claim_window text,
  law_local_terminology text,
  law_public_records_statute text,
  law_notes text,
  steps jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  what_is_body text,
  how_pros_use_body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state, record_type_slug)
);

GRANT SELECT ON public.state_guides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_guides TO authenticated;
GRANT ALL ON public.state_guides TO service_role;

ALTER TABLE public.state_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published state guides are public"
  ON public.state_guides FOR SELECT TO anon, authenticated
  USING (published);

CREATE POLICY "Super admins manage state guides"
  ON public.state_guides FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER state_guides_updated_at
  BEFORE UPDATE ON public.state_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.distress_state_type_stats(_state text, _record_type text)
RETURNS TABLE(
  counties_covered bigint,
  records bigint,
  latest_filed date,
  last_pull_at timestamptz,
  amount_records bigint,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(distinct r.county)::bigint,
    count(*)::bigint,
    max(r.filed_date),
    max(r.created_at),
    count(r.amount)::bigint,
    sum(r.amount)
  FROM public.distress_records r
  WHERE upper(r.state) = upper(_state)
    AND r.record_type = _record_type
$$;

REVOKE ALL ON FUNCTION public.distress_state_type_stats(text, text) FROM public, anon, authenticated;

-- Florida: published rows for the record types with real coverage today.
INSERT INTO public.state_guides
  (state, record_type_slug, published, title, intro,
   law_sale_type, law_records_holder, law_claim_window, law_local_terminology,
   law_public_records_statute, law_notes, steps, faqs, what_is_body, how_pros_use_body)
VALUES
('FL', 'probate', true,
 'Florida Probate Records — County Coverage & How To Pull Them',
 'Florida probate is administered county by county through the Clerk of the Circuit Court, and new estate filings are public the day they are docketed. LeadTrace pulls those dockets nightly so you see estates before the heirs have decided what to do with the house.',
 'Not a sale — a court administration. Any sale of real property happens through the personal representative, sometimes with court authorization.',
 'Clerk of the Circuit Court in the county where the decedent was domiciled.',
 'Creditor claims are generally barred 3 months after the first publication of the notice to creditors (Fla. Stat. §733.702).',
 'Formal administration, summary administration, personal representative, letters of administration.',
 'Fla. Stat. Chapter 119 (Florida Public Records Act).',
 'Florida probate procedure is governed by Fla. Stat. Chapter 733 and the Florida Probate Rules. Some case documents are confidential even when the docket itself is public.',
 '[{"heading":"Open the county Clerk of Court case search","body":"Every Florida clerk publishes a case search. Choose the civil/probate case type and set the court type to Probate."},
   {"heading":"Filter to new filings","body":"Search by filing date range rather than by name. A rolling 7-day window keeps the result set small and current."},
   {"heading":"Pull the case detail","body":"Open each case to capture the decedent name, the personal representative, and the attorney of record."},
   {"heading":"Match the estate to real property","body":"Cross-reference the decedent name against the county property appraiser to find parcels still titled in the estate."},
   {"heading":"Repeat per county","body":"Florida has 67 counties and no statewide probate index, so the work is per-county every day."}]'::jsonb,
 '[{"question":"Are Florida probate filings public?","answer":"Yes. Probate dockets are public records under Fla. Stat. Chapter 119, though individual documents within a case can be confidential."},
   {"question":"Is there a statewide Florida probate search?","answer":"No. Each of the 67 counties runs its own Clerk of Court case search, which is why coverage is built county by county."},
   {"question":"How fast do probate filings appear?","answer":"Most clerks publish a new case to their public docket within one business day of filing."},
   {"question":"Who is the right contact on a probate lead?","answer":"Usually the personal representative, and in many cases the attorney of record listed on the docket."}]'::jsonb,
 'A probate filing opens the court process that settles a deceased person''s estate. When that estate includes real property, the property has to be maintained, insured, and eventually transferred or sold — often by heirs who live somewhere else and never planned to own it.',
 'Probate is the earliest reliable signal that a property may change hands for reasons other than price. Professionals work new filings quickly, lead with the estate''s practical problem rather than the property, and stay patient through the administration timeline.'),
('FL', 'tax-liens', true,
 'Florida Tax Lien Records — County Coverage & How To Pull Them',
 'Florida sells tax certificates rather than the property itself when property taxes go unpaid. Those certificates are recorded per county and are the earliest public marker that an owner is falling behind.',
 'Tax certificate sale (a lien sale), not a transfer of title. A tax deed sale can follow later.',
 'County Tax Collector for certificate sales; Clerk of the Circuit Court for tax deed proceedings.',
 'A certificate holder may apply for a tax deed after 2 years from April 1 of the year the certificate was issued (Fla. Stat. §197.502).',
 'Tax certificate, certificate holder, tax deed application, redemption.',
 'Fla. Stat. Chapter 119 (Florida Public Records Act).',
 'Florida property tax collection and enforcement is governed by Fla. Stat. Chapter 197. Verify current statute text and county practice before relying on any timeline.',
 '[{"heading":"Open the county Tax Collector site","body":"Find the delinquent tax or tax certificate section. Most Florida counties publish sold-certificate lists."},
   {"heading":"Download the certificate list","body":"Filter by sale year and by status so you are looking at outstanding, unredeemed certificates."},
   {"heading":"Join to the parcel","body":"Use the parcel identification number to pull owner and address detail from the property appraiser."},
   {"heading":"Track the age of the certificate","body":"Certificates approaching the 2-year mark are the ones where a tax deed application becomes possible."}]'::jsonb,
 '[{"question":"Does a Florida tax lien mean the owner loses the property?","answer":"Not immediately. A certificate is a lien. The property only moves toward a tax deed sale if the taxes stay unpaid and a certificate holder applies."},
   {"question":"Where are Florida tax certificates published?","answer":"With the county Tax Collector. Many counties use an online auction vendor for the annual sale."},
   {"question":"How current is this data?","answer":"LeadTrace refreshes county sources nightly. Every page states its own last-pull date."}]'::jsonb,
 'A Florida tax lien is a tax certificate sold to an investor when a property owner does not pay property taxes. The owner keeps the property but now owes the certificate amount plus statutory interest.',
 'Unpaid property tax is a cash-flow signal, not a property signal. Professionals watch certificate age, prioritize owners with multiple years outstanding, and reach out well before a tax deed application forces the timeline.'),
('FL', 'code-violations', true,
 'Florida Code Violation Records — County Coverage & How To Pull Them',
 'Florida code enforcement cases are municipal and county records with dates, deadlines, and escalating fines attached. They document deferred maintenance in writing, which is why they correlate so strongly with owners who are ready to talk.',
 'Not a sale. An administrative enforcement case that can become a recorded lien against the property.',
 'The city or county code enforcement division, with liens recorded by the Clerk of the Circuit Court.',
 'An aggrieved party may appeal a code enforcement board order to circuit court within 30 days of execution of the order (Fla. Stat. §162.11).',
 'Code enforcement board, special magistrate, notice of violation, code enforcement lien.',
 'Fla. Stat. Chapter 119 (Florida Public Records Act).',
 'Florida local government code enforcement is governed by Fla. Stat. Chapter 162, including the fine and lien provisions in §162.09. Municipalities may also operate under their own charters.',
 '[{"heading":"Find the jurisdiction''s open data or case portal","body":"Larger Florida jurisdictions publish code enforcement cases as an open dataset; smaller ones only offer a case lookup."},
   {"heading":"Filter to open cases","body":"Closed and complied cases are historical. Open cases with a compliance deadline are the actionable ones."},
   {"heading":"Capture the violation type","body":"Overgrowth, unsafe structure, and unpermitted work each imply a different conversation."},
   {"heading":"Check for a recorded lien","body":"Search the Clerk''s official records for a code enforcement lien against the parcel."}]'::jsonb,
 '[{"question":"Are Florida code violations public record?","answer":"Yes, code enforcement case records are public under Fla. Stat. Chapter 119, subject to specific exemptions."},
   {"question":"Do code fines become liens?","answer":"They can. Fla. Stat. §162.09 provides for fines and for liens against the violator''s property."},
   {"question":"Is coverage statewide?","answer":"No. Code enforcement is city and county level, so coverage is built jurisdiction by jurisdiction."}]'::jsonb,
 'A code violation is a written finding by a city or county that a property fails a local ordinance — overgrown lots, unsafe structures, unpermitted work. The case carries a compliance deadline and, if ignored, escalating daily fines.',
 'Code cases are a maintenance-burden signal with a paper trail and a clock. Professionals sort by violation type and days open, and lead with the deadline the owner is already facing.'),
('FL', 'vacant-properties', true,
 'Florida Vacant Property Records — County Coverage & How To Pull Them',
 'Vacancy is not a court filing, so there is no single statute or register behind it. It is assembled from municipal registries, utility shutoffs, postal vacancy signals and field observation — which is exactly why so few lists have it.',
 'Not a sale and not a court proceeding.',
 'Varies by jurisdiction: municipal vacant or abandoned property registries where they exist.',
 'Not applicable — vacancy is a property condition, not a claim.',
 'Vacant property registry, abandoned real property, zombie property.',
 'Fla. Stat. Chapter 119 (Florida Public Records Act).',
 'Florida has no single statewide vacancy register. Some municipalities operate vacant or abandoned property registration ordinances; verify locally before relying on registry status.',
 '[{"heading":"Check for a municipal vacancy registry","body":"Where a city runs a vacant property ordinance, the registry is a public record request away."},
   {"heading":"Layer in corroborating signals","body":"Utility disconnection, undeliverable mail, and long-inactive permits each raise confidence."},
   {"heading":"Confirm before outreach","body":"Vacancy is a judgement call. Two independent signals should agree before you treat a parcel as vacant."}]'::jsonb,
 '[{"question":"Is there a statewide Florida vacant property list?","answer":"No. Vacancy is assembled from municipal registries and corroborating signals, jurisdiction by jurisdiction."},
   {"question":"How is vacancy verified?","answer":"LeadTrace requires more than one independent signal before a parcel is treated as vacant, and every record states its source."}]'::jsonb,
 'A vacant or abandoned property has no occupant and, frequently, nobody actively maintaining it. Ownership is often absentee, out of state, or an estate that has not been settled.',
 'Vacancy is the strongest condition signal in distressed property work because the carrying cost is pure loss to the owner. Professionals pair vacancy with an ownership signal — probate, tax delinquency, out-of-state mailing address — before investing outreach in it.');

-- Every other state gets an unpublished row per core record type so the admin
-- screen has something to edit. No statute text is invented for these.
INSERT INTO public.state_guides (state, record_type_slug, published)
SELECT s.code, t.slug, false
FROM (VALUES
  ('AL'),('AK'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('DC'),('FL'),('GA'),('HI'),
  ('ID'),('IL'),('IN'),('IA'),('KS'),('KY'),('LA'),('ME'),('MD'),('MA'),('MI'),('MN'),
  ('MS'),('MO'),('MT'),('NE'),('NV'),('NH'),('NJ'),('NM'),('NY'),('NC'),('ND'),('OH'),
  ('OK'),('OR'),('PA'),('RI'),('SC'),('SD'),('TN'),('TX'),('UT'),('VT'),('VA'),('WA'),
  ('WV'),('WI'),('WY')
) AS s(code)
CROSS JOIN (VALUES
  ('probate'),('pre-foreclosure'),('tax-deed'),('tax-liens'),('tax-delinquent'),
  ('code-violations'),('vacant-properties'),('surplus-funds')
) AS t(slug)
ON CONFLICT (state, record_type_slug) DO NOTHING;