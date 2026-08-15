-- One-off: release the 12-hour overlap guard for the distress-feed tick so the
-- robots-skip fix can be verified on a real run instead of waiting until 23:44.
UPDATE public.cron_locks
SET last_tick_at = now() - interval '13 hours'
WHERE key = 'tick-distress-feed';