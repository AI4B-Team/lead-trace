CREATE OR REPLACE FUNCTION public.distress_type_freshness()
RETURNS TABLE(record_type text, data_as_of timestamptz, records bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT d.record_type, max(d.created_at), count(*) FROM public.distress_records d
  WHERE d.record_type IS NOT NULL GROUP BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.distress_type_freshness() TO anon, authenticated, service_role;