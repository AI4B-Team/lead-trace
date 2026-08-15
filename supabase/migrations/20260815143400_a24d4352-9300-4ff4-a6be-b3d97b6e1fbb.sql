-- One-off: release the 12-hour overlap guard so the retirement can be verified now.
UPDATE public.cron_locks
SET last_tick_at = now() - interval '13 hours'
WHERE key = 'tick-distress-feed';