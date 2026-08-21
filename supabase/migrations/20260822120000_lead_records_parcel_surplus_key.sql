-- Let parcel-only surplus rows reach the Leads master.
--
-- Some clerks publish an owner-less, address-less surplus list — only a parcel,
-- a sale date and the held balance (Marion FL is the canonical example). Those
-- `leads` rows carry no phone, no name, no address and no zip, so the rollup's
-- dedupe key collapsed to '||' and the trigger RETURNed without ever writing a
-- lead_records row. The money is claimable by parcel, so the record is real and
-- belongs in the master with its Surplus / Sale Date / Escheat columns.
--
-- Fix: add a PARCEL fallback to the dedupe key (source_meta.parcel_apn + state),
-- tried after phone and the name|address|zip composite. Only rows that would
-- otherwise be keyless (no phone, no name/address/zip) gain the parcel key, so
-- no existing record's identity changes. Everything else in the function is
-- reproduced exactly as the prior migration left it.

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
  v_meta jsonb;
  v_sale_date date;
  v_escheat_date date;
  v_parcel text;
BEGIN
  -- Parcel identity for owner-less / address-less surplus rows. Only used as a
  -- last resort below, so a row that already keys on phone or name+address keeps
  -- the identity it always had.
  v_parcel := nullif(btrim(coalesce(NEW.source_meta->>'parcel_apn', '')), '');

  v_key := coalesce(
    nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), ''),
    nullif(lower(coalesce(NEW.business_name, NEW.full_name, '') || '|' || coalesce(NEW.address, '') || '|' || coalesce(NEW.zip, '')), '||'),
    CASE WHEN v_parcel IS NOT NULL
      THEN 'apn:' || lower(coalesce(NEW.state, '')) || '|' || lower(v_parcel)
      ELSE NULL END
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

  -- Curated facts we surface as Leads columns. Non-null / non-blank only, so the
  -- ON CONFLICT merge below never overwrites a good value with a null.
  v_meta := '{}'::jsonb;
  IF NEW.source_meta IS NOT NULL AND jsonb_typeof(NEW.source_meta) = 'object' THEN
    v_meta := coalesce((
      SELECT jsonb_object_agg(e.key, e.value)
      FROM jsonb_each(NEW.source_meta) e
      WHERE e.key IN (
        'record_type', 'county', 'surplus_amount', 'surplus_basis',
        'sale_date', 'auction_date', 'disbursement_status', 'case_status',
        'source_url'
      )
      AND e.value IS NOT NULL
      AND jsonb_typeof(e.value) <> 'null'
      AND (jsonb_typeof(e.value) <> 'string' OR btrim(e.value #>> '{}') <> '')
    ), '{}'::jsonb);
  END IF;

  -- Escheat date from the clerk/auction sale date + the state's PUBLISHED escheat
  -- window. Same join the surplus_records_visible view uses, so the Leads
  -- countdown can never diverge from the feed. Best-effort: any missing piece
  -- (sale date, published statute) simply leaves escheat_date out.
  BEGIN
    v_sale_date := nullif(btrim(coalesce(NEW.source_meta->>'sale_date', NEW.source_meta->>'auction_date', '')), '')::date;
  EXCEPTION WHEN others THEN
    v_sale_date := NULL;
  END;

  IF v_sale_date IS NOT NULL
     AND v_record IS NOT NULL AND lower(v_record) LIKE '%surplus%'
     AND NEW.state IS NOT NULL THEN
    SELECT (v_sale_date + s.escheat_days)
    INTO v_escheat_date
    FROM public.surplus_statutes s
    WHERE s.state = upper(NEW.state)
      AND s.published = true
      AND s.escheat_days IS NOT NULL
      AND s.sale_kind = CASE
        WHEN coalesce(NEW.source_meta->>'surplus_basis', '') = 'opening_bid' THEN 'tax_deed'
        ELSE 'foreclosure' END
    LIMIT 1;

    IF v_escheat_date IS NOT NULL THEN
      v_meta := v_meta || jsonb_build_object('escheat_date', to_char(v_escheat_date, 'YYYY-MM-DD'));
    END IF;

  INSERT INTO public.lead_records (
    workspace_id, dedupe_key, full_name, business_name, phone, phone_type, email,
    address, website, socials, handle, platform, followers, engagement,
    city, state, zip, disposition, source_types, record_types, source_meta,
    first_seen_job_id, last_seen_job_id, is_new, data_provenance
  ) VALUES (
    NEW.workspace_id, v_key, NEW.full_name, NEW.business_name, NEW.phone, NEW.phone_type, NEW.email,
    NEW.address, v_website, v_socials, v_handle, v_platform, v_followers, v_engagement,
    NEW.city, NEW.state, NEW.zip, v_disposition,
    CASE WHEN v_source IS NULL THEN '{}'::text[] ELSE ARRAY[v_source] END,
    CASE WHEN v_record IS NULL THEN '{}'::text[] ELSE ARRAY[v_record] END,
    v_meta,
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
    -- New non-null facts win; existing keys are preserved when the newer row omits them.
    source_meta = public.lead_records.source_meta || EXCLUDED.source_meta,
    list_count = public.lead_records.list_count + CASE
      WHEN public.lead_records.last_seen_job_id IS DISTINCT FROM EXCLUDED.last_seen_job_id THEN 1 ELSE 0 END,
    last_seen_job_id = EXCLUDED.last_seen_job_id,
    last_seen_at = now(),
    is_new = false,
    updated_at = now();

  RETURN NEW;
END;
$function$;

  END IF;

  v_engagement := nullif(coalesce(NEW.source_meta->>'engagement', NEW.source_meta->>'engagement_rate', ''), '');

-- Backfill: replay any parcel-only surplus leads that the OLD key dropped (rows
-- with no phone/name/address/zip but a parcel_apn). Mirrors the trigger's INSERT
-- shape and new key, dedupes on the parcel key, and never touches rows that
-- already produced a lead_records entry under their own key.
WITH parcel_leads AS (
  SELECT
    l.workspace_id,
    'apn:' || lower(coalesce(l.state, '')) || '|' ||
      lower(btrim(l.source_meta->>'parcel_apn')) AS dedupe_key,
    l.full_name, l.business_name, l.phone, l.phone_type, l.email,
    l.address, l.city, l.state, l.zip, l.scrub_status, l.data_provenance,
    l.job_id, l.source_meta, l.created_at,
    j.source_type, j.record_type,
    row_number() OVER (
      PARTITION BY l.workspace_id,
        'apn:' || lower(coalesce(l.state, '')) || '|' || lower(btrim(l.source_meta->>'parcel_apn'))
      ORDER BY l.created_at DESC
    ) AS rn
  FROM public.leads l
  LEFT JOIN public.jobs j ON j.id = l.job_id
  WHERE nullif(btrim(coalesce(l.source_meta->>'parcel_apn', '')), '') IS NOT NULL
    -- Only rows the old key would have collapsed to '||' (truly keyless otherwise).
    AND nullif(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), '') IS NULL
    AND nullif(lower(coalesce(l.business_name, l.full_name, '') || '|' || coalesce(l.address, '') || '|' || coalesce(l.zip, '')), '||') IS NULL
), curated AS (
  SELECT p.*,
    coalesce((
      SELECT jsonb_object_agg(e.key, e.value)
      FROM jsonb_each(coalesce(p.source_meta, '{}'::jsonb)) e
      WHERE e.key IN (
        'record_type', 'county', 'surplus_amount', 'surplus_basis',
        'sale_date', 'auction_date', 'disbursement_status', 'case_status',
        'source_url'
      )
      AND e.value IS NOT NULL
      AND jsonb_typeof(e.value) <> 'null'
      AND (jsonb_typeof(e.value) <> 'string' OR btrim(e.value #>> '{}') <> '')
    ), '{}'::jsonb) AS meta
  FROM parcel_leads p
  WHERE p.rn = 1
)
INSERT INTO public.lead_records (
  workspace_id, dedupe_key, full_name, business_name, phone, phone_type, email,
  address, city, state, zip, disposition, source_types, record_types, source_meta,
  first_seen_job_id, last_seen_job_id, is_new, data_provenance
)
SELECT
  c.workspace_id, c.dedupe_key, c.full_name, c.business_name, c.phone,
  coalesce(c.phone_type, 'unknown'), c.email,
  c.address, c.city, c.state, c.zip,
  CASE WHEN c.scrub_status IN ('litigator', 'dnc', 'clean') THEN c.scrub_status ELSE 'clean' END,
  CASE WHEN c.source_type IS NULL THEN '{}'::text[] ELSE ARRAY[c.source_type] END,
  CASE WHEN c.record_type IS NULL THEN '{}'::text[] ELSE ARRAY[c.record_type] END,
  c.meta
    || CASE
         WHEN c.record_type IS NOT NULL AND lower(c.record_type) LIKE '%surplus%'
              AND c.state IS NOT NULL
              AND nullif(btrim(coalesce(c.source_meta->>'sale_date', c.source_meta->>'auction_date', '')), '') IS NOT NULL
              AND s.escheat_days IS NOT NULL
         THEN jsonb_build_object(
                'escheat_date',
                to_char(nullif(btrim(coalesce(c.source_meta->>'sale_date', c.source_meta->>'auction_date', '')), '')::date + s.escheat_days, 'YYYY-MM-DD'))
         ELSE '{}'::jsonb
       END,
  c.job_id, c.job_id, true, coalesce(c.data_provenance, 'unknown')
FROM curated c
LEFT JOIN public.surplus_statutes s
  ON s.state = upper(c.state)
  AND s.published = true
  AND s.escheat_days IS NOT NULL
  AND s.sale_kind = CASE
    WHEN coalesce(c.source_meta->>'surplus_basis', '') = 'opening_bid' THEN 'tax_deed'
    ELSE 'foreclosure' END
ON CONFLICT (workspace_id, dedupe_key) DO NOTHING;

