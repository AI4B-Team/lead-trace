REVOKE ALL ON FUNCTION public.distress_state_type_counties(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.distress_surplus_preview(text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distress_state_type_counties(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.distress_surplus_preview(text, text, integer) TO service_role;