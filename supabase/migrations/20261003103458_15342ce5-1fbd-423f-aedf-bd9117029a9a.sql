REVOKE EXECUTE ON FUNCTION public.distress_type_freshness() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distress_type_freshness() TO service_role;