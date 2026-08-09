-- 1. Provenance on the deduplicated leads library (H3, extended to lead_records)
ALTER TABLE public.lead_records
  ADD COLUMN IF NOT EXISTS data_provenance text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.lead_records
  DROP CONSTRAINT IF EXISTS lead_records_data_provenance_chk;
ALTER TABLE public.lead_records
  ADD CONSTRAINT lead_records_data_provenance_chk
  CHECK (data_provenance = ANY (ARRAY['verified_source','mock_legacy','user_upload','unknown']));

CREATE INDEX IF NOT EXISTS lead_records_ws_provenance_idx
  ON public.lead_records (workspace_id, data_provenance);

-- Backfill from the raw rows, recomputing the same dedupe key the rollup uses.
WITH keyed AS (
  SELECT
    l.workspace_id,
    coalesce(
      nullif(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), ''),
      lower(coalesce(l.business_name, l.full_name, '') || '|' || coalesce(l.address, '') || '|' || coalesce(l.zip, ''))
    ) AS dedupe_key,
    l.data_provenance
  FROM public.leads l
), ranked AS (
  SELECT workspace_id, dedupe_key,
    max(CASE data_provenance
      WHEN 'verified_source' THEN 3
      WHEN 'user_upload' THEN 2
      WHEN 'unknown' THEN 1
      ELSE 0 END) AS rank
  FROM keyed
  GROUP BY 1, 2
)
UPDATE public.lead_records lr
SET data_provenance = CASE r.rank
  WHEN 3 THEN 'verified_source'
  WHEN 2 THEN 'user_upload'
  WHEN 1 THEN 'unknown'
  ELSE 'mock_legacy' END
FROM ranked r
WHERE r.workspace_id = lr.workspace_id AND r.dedupe_key = lr.dedupe_key;

-- Carry provenance forward on every future rollup. Trust only ever upgrades:
-- a verified row never becomes legacy because a stale duplicate arrived later.
CREATE OR REPLACE FUNCTION public.rollup_lead_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_source text;
  v_record text;
  v_disposition text;
  v_website text;
  v_socials jsonb;
  v_handle text;
  v_platform text;
  v_followers text;
  v_engagement text;
BEGIN
  v_key := coalesce(
    nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), ''),
    lower(coalesce(NEW.business_name, NEW.full_name, '') || '|' || coalesce(NEW.address, '') || '|' || coalesce(NEW.zip, ''))
  );
  IF v_key IS NULL OR v_key = '||' THEN
    RETURN NEW;
  END IF;

  SELECT j.source_type, j.record_type INTO v_source, v_record
  FROM public.jobs j WHERE j.id = NEW.job_id;

  v_disposition := CASE
    WHEN NEW.scrub_status IN ('litigator', 'dnc', 'clean') THEN NEW.scrub_status
    ELSE 'clean' END;

  v_website := nullif(coalesce(NEW.source_meta->>'website', NEW.source_meta->>'url', ''), '');
  v_socials := '{}'::jsonb;
  IF nullif(coalesce(NEW.source_meta->>'instagram', ''), '') IS NOT NULL THEN
    v_socials := v_socials || jsonb_build_object('instagram', NEW.source_meta->>'instagram');
  END IF;
  IF nullif(coalesce(NEW.source_meta->>'linkedin', ''), '') IS NOT NULL THEN
    v_socials := v_socials || jsonb_build_object('linkedin', NEW.source_meta->>'linkedin');
  END IF;

  v_handle := nullif(coalesce(NEW.source_meta->>'handle', NEW.source_meta->>'username', ''), '');
  v_platform := nullif(coalesce(NEW.source_meta->>'platform', ''), '');
  v_followers := nullif(coalesce(NEW.source_meta->>'followers', NEW.source_meta->>'follower_count', ''), '');
  v_engagement := nullif(coalesce(NEW.source_meta->>'engagement', NEW.source_meta->>'engagement_rate', ''), '');

  INSERT INTO public.lead_records (
    workspace_id, dedupe_key, full_name, business_name, phone, phone_type, email,
    address, website, socials, handle, platform, followers, engagement,
    city, state, zip, disposition, source_types, record_types,
    first_seen_job_id, last_seen_job_id, is_new, data_provenance
  ) VALUES (
    NEW.workspace_id, v_key, NEW.full_name, NEW.business_name, NEW.phone, NEW.phone_type, NEW.email,
    NEW.address, v_website, v_socials, v_handle, v_platform, v_followers, v_engagement,
    NEW.city, NEW.state, NEW.zip, v_disposition,
    CASE WHEN v_source IS NULL THEN '{}'::text[] ELSE ARRAY[v_source] END,
    CASE WHEN v_record IS NULL THEN '{}'::text[] ELSE ARRAY[v_record] END,
    NEW.job_id, NEW.job_id, true, coalesce(NEW.data_provenance, 'unknown')
  )
  ON CONFLICT (workspace_id, dedupe_key) DO UPDATE SET
    full_name = coalesce(public.lead_records.full_name, EXCLUDED.full_name),
    business_name = coalesce(public.lead_records.business_name, EXCLUDED.business_name),
    phone = coalesce(public.lead_records.phone, EXCLUDED.phone),
    phone_type = coalesce(EXCLUDED.phone_type, public.lead_records.phone_type),
    email = coalesce(public.lead_records.email, EXCLUDED.email),
    address = coalesce(public.lead_records.address, EXCLUDED.address),
    website = coalesce(public.lead_records.website, EXCLUDED.website),
    socials = public.lead_records.socials || EXCLUDED.socials,
    handle = coalesce(public.lead_records.handle, EXCLUDED.handle),
    platform = coalesce(public.lead_records.platform, EXCLUDED.platform),
    followers = coalesce(EXCLUDED.followers, public.lead_records.followers),
    engagement = coalesce(EXCLUDED.engagement, public.lead_records.engagement),
    city = coalesce(public.lead_records.city, EXCLUDED.city),
    state = coalesce(public.lead_records.state, EXCLUDED.state),
    zip = coalesce(public.lead_records.zip, EXCLUDED.zip),
    disposition = CASE
      WHEN public.lead_records.disposition = 'litigator' OR EXCLUDED.disposition = 'litigator' THEN 'litigator'
      WHEN public.lead_records.disposition = 'dnc' OR EXCLUDED.disposition = 'dnc' THEN 'dnc'
      ELSE EXCLUDED.disposition END,
    data_provenance = CASE
      WHEN public.lead_records.data_provenance = 'verified_source' OR EXCLUDED.data_provenance = 'verified_source' THEN 'verified_source'
      WHEN public.lead_records.data_provenance = 'user_upload' OR EXCLUDED.data_provenance = 'user_upload' THEN 'user_upload'
      WHEN public.lead_records.data_provenance = 'unknown' OR EXCLUDED.data_provenance = 'unknown' THEN 'unknown'
      ELSE 'mock_legacy' END,
    source_types = (
      SELECT array_agg(DISTINCT s) FROM unnest(public.lead_records.source_types || EXCLUDED.source_types) AS s
    ),
    record_types = (
      SELECT array_agg(DISTINCT r) FROM unnest(public.lead_records.record_types || EXCLUDED.record_types) AS r
    ),
    list_count = public.lead_records.list_count + CASE
      WHEN public.lead_records.last_seen_job_id IS DISTINCT FROM EXCLUDED.last_seen_job_id THEN 1 ELSE 0 END,
    last_seen_job_id = EXCLUDED.last_seen_job_id,
    last_seen_at = now(),
    is_new = false,
    updated_at = now();

  RETURN NEW;
END;
$function$;

-- 2. Worklist nominations. A nomination is "here is who to work", not a
-- proposal to change something, so it never enters the approval queue.
CREATE TABLE IF NOT EXISTS public.worklist_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.lead_records(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.background_agents(id) ON DELETE SET NULL,
  score integer NOT NULL DEFAULT 0,
  reasons text[] NOT NULL DEFAULT '{}'::text[],
  signals text[] NOT NULL DEFAULT '{}'::text[],
  record_types text[] NOT NULL DEFAULT '{}'::text[],
  cold_start boolean NOT NULL DEFAULT false,
  scout_version text,
  status text NOT NULL DEFAULT 'open',
  nominated_at timestamp with time zone NOT NULL DEFAULT now(),
  dismissed_at timestamp with time zone,
  dismissed_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT worklist_nominations_status_chk CHECK (status = ANY (ARRAY['open','dismissed','worked'])),
  CONSTRAINT worklist_nominations_unique UNIQUE (workspace_id, lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worklist_nominations TO authenticated;
GRANT ALL ON public.worklist_nominations TO service_role;

ALTER TABLE public.worklist_nominations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read workspace nominations"
  ON public.worklist_nominations FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));

CREATE POLICY "Members dismiss workspace nominations"
  ON public.worklist_nominations FOR UPDATE TO authenticated
  USING (private.is_workspace_member(workspace_id))
  WITH CHECK (private.is_workspace_member(workspace_id));

CREATE INDEX IF NOT EXISTS worklist_nominations_open_idx
  ON public.worklist_nominations (workspace_id, score DESC)
  WHERE status = 'open';

CREATE TRIGGER worklist_nominations_updated_at
  BEFORE UPDATE ON public.worklist_nominations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Record-type dimension on labeled conversations. A foreclosure objection
-- and a roofer objection are unrelated; averaging them produces nothing.
ALTER TABLE public.conversation_outcomes
  ADD COLUMN IF NOT EXISTS record_type text;

CREATE INDEX IF NOT EXISTS conversation_outcomes_record_type_idx
  ON public.conversation_outcomes (workspace_id, record_type);

UPDATE public.conversation_outcomes co
SET record_type = lr.record_types[1]
FROM public.lead_records lr
WHERE lr.id = co.lead_id
  AND co.record_type IS NULL
  AND array_length(lr.record_types, 1) >= 1;
