-- ---------------------------------------------------------------------------
-- Phase 2: clerk-confirmed surplus.
--
-- Phase 1 DERIVES surplus from RealAuction sale results (estimated). Phase 2
-- reads the clerk's official surplus list, which is the only source of a
-- confirmed amount and a claim deadline.
-- ---------------------------------------------------------------------------

CREATE TABLE public.surplus_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county_name text NOT NULL,
  state text NOT NULL,
  sale_kind text NOT NULL CHECK (sale_kind IN ('foreclosure', 'tax_deed')),
  handler text NOT NULL CHECK (handler IN ('html_table', 'pdf_list', 'realauction_tab', 'open_data', 'records_request')),
  source_url text,
  -- Every selector lives here: a markup change is a data fix, not a deploy.
  fetch_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  refresh_cadence text NOT NULL DEFAULT 'weekly'
    CHECK (refresh_cadence IN ('daily', 'weekly', 'biweekly', 'monthly')),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  -- 'unverified' rows are excluded from customer-facing results until a human
  -- confirms the handler against a real page and promotes them to 'live'.
  status text NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('live', 'unverified', 'broken', 'manual')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state, county_name, sale_kind)
);

GRANT SELECT ON public.surplus_sources TO authenticated;
GRANT ALL ON public.surplus_sources TO service_role;
ALTER TABLE public.surplus_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "surplus_sources_read" ON public.surplus_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "surplus_sources_admin_write" ON public.surplus_sources
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER surplus_sources_updated_at BEFORE UPDATE ON public.surplus_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.surplus_statutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  sale_kind text NOT NULL CHECK (sale_kind IN ('foreclosure', 'tax_deed')),
  statute_citation text NOT NULL,
  -- NULL until a human reads current statute text. A wrong deadline costs a
  -- customer their claim, so nothing is displayed without verified_at.
  claim_window_days integer,
  window_starts_from text CHECK (window_starts_from IN ('sale_date', 'notice_date', 'certificate_date')),
  fee_cap_pct numeric,
  requires_finder_license boolean,
  verified_by text,
  verified_at timestamptz,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state, sale_kind, statute_citation)
);

GRANT SELECT ON public.surplus_statutes TO authenticated;
GRANT ALL ON public.surplus_statutes TO service_role;
ALTER TABLE public.surplus_statutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "surplus_statutes_read" ON public.surplus_statutes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "surplus_statutes_admin_write" ON public.surplus_statutes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER surplus_statutes_updated_at BEFORE UPDATE ON public.surplus_statutes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Citations only. claim_window_days and verified_at stay NULL on purpose: the
-- UI shows "Deadline not verified for this state" until a human fills them in.
INSERT INTO public.surplus_statutes
  (state, sale_kind, statute_citation, fee_cap_pct, requires_finder_license, source_url, notes)
VALUES
  ('FL', 'foreclosure', 'Fla. Stat. 45.032', NULL, NULL,
   'https://www.flsenate.gov/Laws/Statutes/2023/45.032',
   'Foreclosure surplus; owner claim window. Day count UNVERIFIED — read current text before enabling deadlines.'),
  ('FL', 'foreclosure', 'Fla. Stat. 45.033', 12, NULL,
   'https://www.flsenate.gov/Laws/Statutes/2023/45.033',
   'Assignment of surplus rights and fee cap. Fee cap percentage UNVERIFIED pending statute read.'),
  ('FL', 'tax_deed', 'Fla. Stat. 197.582', NULL, NULL,
   'https://www.flsenate.gov/Laws/Statutes/2023/197.582',
   'Tax deed surplus distribution. Day count UNVERIFIED — read current text before enabling deadlines.');


CREATE TABLE public.surplus_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  county_name text NOT NULL,
  state text NOT NULL,
  sale_kind text NOT NULL CHECK (sale_kind IN ('foreclosure', 'tax_deed')),
  case_number text,
  parcel_apn text,
  property_address text,
  confirmed_amount numeric,
  sale_date date,
  claim_deadline date,
  -- Set when the clerk publishes a deadline directly; that value always wins
  -- over anything computed from the statute table.
  deadline_from_clerk boolean NOT NULL DEFAULT false,
  claim_status text NOT NULL DEFAULT 'unknown'
    CHECK (claim_status IN ('unclaimed', 'claim_filed', 'disbursed', 'escheated', 'unknown')),
  claimant_name text,
  source_id uuid REFERENCES public.surplus_sources(id) ON DELETE SET NULL,
  source_url text,
  -- Timestamp of the FETCH that produced this record, not of the row write.
  confirmed_as_of timestamptz NOT NULL,
  -- Reconciliation against the phase 1 derived record.
  derived_record_id uuid REFERENCES public.distress_records(id) ON DELETE SET NULL,
  derived_amount numeric,
  match_method text CHECK (match_method IN ('case_number', 'parcel_apn', 'address_date', 'unmatched')),
  match_is_fuzzy boolean NOT NULL DEFAULT false,
  -- A >5% gap usually means the derivation or the parser is wrong; that signal
  -- matters more than the individual record.
  variance_pct numeric,
  needs_review boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX surplus_confirmations_dedupe
  ON public.surplus_confirmations (state, county_name, sale_kind, coalesce(case_number, ''), coalesce(parcel_apn, ''), coalesce(sale_date, '1900-01-01'::date));
CREATE INDEX surplus_confirmations_county ON public.surplus_confirmations (state, county_name, claim_status);
CREATE INDEX surplus_confirmations_deadline ON public.surplus_confirmations (claim_deadline) WHERE claim_status = 'unclaimed';
CREATE INDEX surplus_confirmations_review ON public.surplus_confirmations (needs_review) WHERE needs_review;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.surplus_confirmations TO authenticated;
GRANT ALL ON public.surplus_confirmations TO service_role;
ALTER TABLE public.surplus_confirmations ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped. Rows with a NULL workspace_id are platform-wide clerk data
-- and are served through server functions, not direct client reads.
CREATE POLICY "surplus_confirmations_member_read" ON public.surplus_confirmations
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = public.surplus_confirmations.workspace_id
      AND m.user_id = auth.uid()
  ));
CREATE POLICY "surplus_confirmations_member_write" ON public.surplus_confirmations
  FOR ALL TO authenticated
  USING (workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = public.surplus_confirmations.workspace_id
      AND m.user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = public.surplus_confirmations.workspace_id
      AND m.user_id = auth.uid()
  ));

CREATE TRIGGER surplus_confirmations_updated_at BEFORE UPDATE ON public.surplus_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
