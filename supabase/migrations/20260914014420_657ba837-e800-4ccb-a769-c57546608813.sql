CREATE TABLE public.platform_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_flags TO service_role;
ALTER TABLE public.platform_flags ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.realeflow_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  external_account_id TEXT NOT NULL,
  realeflow_account_id TEXT NOT NULL DEFAULT '',
  site_plan_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.realeflow_accounts TO authenticated;
GRANT ALL ON public.realeflow_accounts TO service_role;
ALTER TABLE public.realeflow_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own realeflow account" ON public.realeflow_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);