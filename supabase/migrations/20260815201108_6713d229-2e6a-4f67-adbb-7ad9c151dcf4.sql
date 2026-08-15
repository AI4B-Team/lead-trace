ALTER TABLE public.records_request_files
  ADD COLUMN IF NOT EXISTS detected_columns text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sample_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_text text;