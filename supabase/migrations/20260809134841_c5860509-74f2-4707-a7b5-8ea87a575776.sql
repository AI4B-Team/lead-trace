ALTER TABLE public.lead_records
  ADD COLUMN IF NOT EXISTS nominated_at timestamptz,
  ADD COLUMN IF NOT EXISTS nominated_score integer,
  ADD COLUMN IF NOT EXISTS nominated_reason text,
  ADD COLUMN IF NOT EXISTS nominated_by uuid;

CREATE INDEX IF NOT EXISTS lead_records_nominated_idx
  ON public.lead_records (workspace_id, nominated_at DESC)
  WHERE nominated_at IS NOT NULL;