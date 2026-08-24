-- The resumable RealeFlow sweep resumes from a row in sourcing_cursors keyed
-- 'realeflow-fl-counties'. The row is created lazily by writeCursor() on the
-- first tick, but the nightly cron only pulled open-data feeds for a stretch,
-- so the row never materialised and each tick restarted from position 0 instead
-- of advancing through the 67-county matrix. Seed it explicitly so the cursor
-- exists from the outset and the sweep is resumable on the very first run.
--
-- Idempotent: ON CONFLICT DO NOTHING leaves an already-advanced cursor untouched
-- (we must never rewind a live cursor back to 0 and re-pull counties already
-- covered this cycle).
INSERT INTO public.sourcing_cursors (key, position, cycles, last_label)
VALUES ('realeflow-fl-counties', 0, 0, NULL)
ON CONFLICT (key) DO NOTHING;
