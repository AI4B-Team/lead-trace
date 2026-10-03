ALTER TABLE public.realeflow_accounts
  ADD COLUMN IF NOT EXISTS deactivation_note text,
  ADD COLUMN IF NOT EXISTS deactivation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid;