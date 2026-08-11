CREATE OR REPLACE FUNCTION public.distress_state_type_counties(_state text, _record_type text)
RETURNS TABLE(county text, records bigint, latest_filed date, last_pull_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.county,
         count(*)::bigint,
         max(d.filed_date),
         max(d.created_at)
  FROM public.distress_records d
  WHERE lower(d.state) = lower(_state)
    AND d.record_type = _record_type
    AND d.county IS NOT NULL
  GROUP BY d.county
  ORDER BY 2 DESC, 1;
$$;

REVOKE ALL ON FUNCTION public.distress_state_type_counties(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distress_state_type_counties(text, text) TO anon, authenticated, service_role;