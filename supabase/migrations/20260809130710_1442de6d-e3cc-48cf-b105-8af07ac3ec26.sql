CREATE TABLE public.bot_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  assembled_prompt text,
  change_kind text NOT NULL DEFAULT 'edit',
  change_source text NOT NULL DEFAULT 'manual',
  proposal_id uuid REFERENCES public.agent_proposals(id) ON DELETE SET NULL,
  changed_by uuid,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, version)
);

CREATE INDEX bot_profile_versions_profile_idx ON public.bot_profile_versions (profile_id, version DESC);
CREATE INDEX bot_profile_versions_workspace_idx ON public.bot_profile_versions (workspace_id, created_at DESC);

GRANT SELECT, INSERT ON public.bot_profile_versions TO authenticated;
GRANT ALL ON public.bot_profile_versions TO service_role;

ALTER TABLE public.bot_profile_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read workspace profile versions" ON public.bot_profile_versions
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

CREATE POLICY "Admins record workspace profile versions" ON public.bot_profile_versions
  FOR INSERT TO authenticated WITH CHECK (private.is_workspace_admin(workspace_id));