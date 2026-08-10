ALTER TABLE public.distress_pulls
  ADD COLUMN IF NOT EXISTS bytes_downloaded integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS http_status integer;