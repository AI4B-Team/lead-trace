ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_body text,
  ADD COLUMN IF NOT EXISTS gave_up boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS webhook_deliveries_retry_idx
  ON public.webhook_deliveries (next_retry_at)
  WHERE ok = false AND gave_up = false AND next_retry_at IS NOT NULL;