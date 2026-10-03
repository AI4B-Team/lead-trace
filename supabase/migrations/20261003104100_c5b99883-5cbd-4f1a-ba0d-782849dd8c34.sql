REVOKE ALL ON public.platform_flags FROM anon, authenticated;
REVOKE ALL ON public.sourcing_cursors FROM anon, authenticated;
REVOKE ALL ON public.api_rate_counters FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.realeflow_accounts FROM anon, authenticated;
REVOKE ALL ON public.realeflow_accounts FROM anon;