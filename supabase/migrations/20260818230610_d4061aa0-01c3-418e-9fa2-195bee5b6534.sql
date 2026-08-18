-- The nightly RealeFlow sweep cannot finish 67 counties x 3 record types inside a
-- single invocation (>=1s polite delay per request), so it processes a bounded
-- slice per tick and resumes from a stored position on the next tick. This table
-- holds that position. Server-side only: no anon/authenticated grants.
CREATE TABLE public.sourcing_cursors (
  key text PRIMARY KEY,
  position integer NOT NULL DEFAULT 0,
  cycles integer NOT NULL DEFAULT 0,
  last_label text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.sourcing_cursors TO service_role;

ALTER TABLE public.sourcing_cursors ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: only the service role (cron / server functions) may
-- touch this table, and the service role bypasses RLS.

CREATE TRIGGER sourcing_cursors_set_updated_at
BEFORE UPDATE ON public.sourcing_cursors
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();