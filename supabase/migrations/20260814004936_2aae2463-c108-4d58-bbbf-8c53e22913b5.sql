CREATE OR REPLACE FUNCTION public.sync_data_backed_coverage()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer := 0;
BEGIN
  WITH actual AS (
    SELECT d.state,
           d.county,
           d.record_type,
           count(*)::int AS n,
           max(d.fips) AS fips,
           max(d.created_at) AS last_seen
    FROM public.distress_records d
    WHERE d.state IS NOT NULL AND d.county IS NOT NULL AND d.record_type IS NOT NULL
    GROUP BY 1,2,3
  ),
  missing AS (
    SELECT a.* FROM actual a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.source_coverage c
      WHERE lower(c.state) = lower(a.state)
        AND lower(coalesce(c.county_name,'')) = lower(a.county)
        AND lower(c.record_type) = lower(a.record_type)
        AND c.status = 'verified'
    )
  ),
  ins AS (
    INSERT INTO public.source_coverage (fips, state, county_name, record_type, status, verified_at, last_success_at, sample_row_count)
    SELECT m.fips, m.state, m.county, m.record_type, 'verified', now(), m.last_seen, m.n
    FROM missing m
    RETURNING 1
  )
  SELECT count(*)::int INTO inserted FROM ins;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_data_backed_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_data_backed_coverage() TO service_role;

SELECT public.sync_data_backed_coverage();