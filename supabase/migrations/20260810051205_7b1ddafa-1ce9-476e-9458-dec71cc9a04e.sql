UPDATE public.jobs
SET status = 'failed',
    failed_stage = 'scraping',
    failed_at = now(),
    error = 'Run was interrupted before the source finished. Retry to start it again.'
WHERE id = 'c01fbff2-235b-491c-bd6b-29bddfa465da'
  AND status = 'scraping';