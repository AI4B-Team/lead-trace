CREATE INDEX IF NOT EXISTS lead_records_shortlist_idx
  ON public.lead_records (workspace_id, nominated_at DESC)
  WHERE nominated_at IS NOT NULL;