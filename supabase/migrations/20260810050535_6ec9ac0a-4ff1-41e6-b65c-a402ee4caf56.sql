-- Move any recurring schedule that was set on a run row up to its parent list,
-- so the recurring engine (which only walks list rows) picks it up again.
WITH orphan AS (
  SELECT id, parent_job_id, schedule, custom_interval_minutes, schedule_active, next_run_at
  FROM public.jobs
  WHERE parent_job_id IS NOT NULL AND schedule <> 'one_time'
)
UPDATE public.jobs p
SET schedule = o.schedule,
    custom_interval_minutes = o.custom_interval_minutes,
    schedule_active = o.schedule_active,
    next_run_at = GREATEST(o.next_run_at, now())
FROM orphan o
WHERE p.id = o.parent_job_id;

UPDATE public.jobs
SET schedule = 'one_time', custom_interval_minutes = NULL, next_run_at = NULL
WHERE parent_job_id IS NOT NULL AND schedule <> 'one_time';