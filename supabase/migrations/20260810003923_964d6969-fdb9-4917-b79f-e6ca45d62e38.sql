CREATE OR REPLACE FUNCTION public.adapter_demand()
 RETURNS TABLE(source_key text, display_label text, requests bigint, workspaces bigint, queued bigint, needs_review bigint, screened_out bigint, frequencies text[], desired_fields text[], logins text[], sample_url text, first_requested_at timestamp with time zone, last_requested_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF NOT (current_user = 'service_role' OR private.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH keyed AS (
    SELECT
      lower(coalesce(nullif(a.source_label, ''), nullif(a.template_id, ''), nullif(a.record_type, ''), nullif(a.county, ''), 'unspecified')) AS k,
      coalesce(nullif(a.source_label, ''), nullif(a.template_id, ''), nullif(a.record_type, ''), nullif(a.county, ''), 'Unspecified') AS label,
      a.*
    FROM public.adapter_requests a
  )
  SELECT
    k.k,
    min(k.label),
    count(*),
    count(DISTINCT k.workspace_id),
    count(*) FILTER (WHERE k.status = 'queued'),
    count(*) FILTER (WHERE k.status = 'needs_review'),
    count(*) FILTER (WHERE k.status = 'screened_out'),
    array_agg(DISTINCT k.frequency) FILTER (WHERE k.frequency IS NOT NULL),
    (SELECT array_agg(DISTINCT d) FROM keyed k2, unnest(coalesce(k2.desired_fields, ARRAY[]::text[])) AS d WHERE k2.k = k.k),
    array_agg(DISTINCT coalesce(k.login_required, 'none')),
    min(k.target_url),
    min(k.created_at),
    max(k.created_at)
  FROM keyed k
  GROUP BY k.k
  ORDER BY count(DISTINCT k.workspace_id) DESC, count(*) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.adapter_request_notify_list(_source_key text)
 RETURNS TABLE(request_id uuid, workspace_id uuid, workspace_name text, email text, frequency text, requested_at timestamp with time zone, notified_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF NOT (current_user = 'service_role' OR private.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.workspace_id,
    w.name,
    u.email::text,
    a.frequency,
    a.created_at,
    a.notified_at
  FROM public.adapter_requests a
  LEFT JOIN public.workspaces w ON w.id = a.workspace_id
  LEFT JOIN auth.users u ON u.id = a.requested_by
  WHERE a.status = 'queued'
    AND lower(coalesce(nullif(a.source_label, ''), nullif(a.template_id, ''), nullif(a.record_type, ''), nullif(a.county, ''), 'unspecified')) = lower(_source_key)
  ORDER BY a.created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.adapter_demand() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adapter_request_notify_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adapter_demand() TO service_role;
GRANT EXECUTE ON FUNCTION public.adapter_request_notify_list(text) TO service_role;