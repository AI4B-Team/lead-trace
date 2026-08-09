REVOKE ALL ON public.cron_credentials FROM anon, authenticated;
REVOKE ALL ON public.cron_locks FROM anon, authenticated;
GRANT ALL ON public.cron_credentials TO service_role;
GRANT ALL ON public.cron_locks TO service_role;