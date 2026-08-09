CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX api_keys_workspace_idx ON public.api_keys (workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_member_read" ON public.api_keys
  FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));

CREATE POLICY "api_keys_admin_insert" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (private.is_workspace_admin(workspace_id));

CREATE POLICY "api_keys_admin_update" ON public.api_keys
  FOR UPDATE TO authenticated
  USING (private.is_workspace_admin(workspace_id))
  WITH CHECK (private.is_workspace_admin(workspace_id));

CREATE POLICY "api_keys_admin_delete" ON public.api_keys
  FOR DELETE TO authenticated
  USING (private.is_workspace_admin(workspace_id));