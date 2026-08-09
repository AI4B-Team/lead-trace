CREATE TABLE public.background_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'flag_only' CHECK (mode IN ('flag_only','active','off')),
  interval_minutes int NOT NULL,
  last_run_at timestamptz,
  next_run_at timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  consecutive_failures int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX background_agents_ws_key_idx ON public.background_agents (COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), agent_key);
GRANT SELECT ON public.background_agents TO authenticated;
GRANT ALL ON public.background_agents TO service_role;
ALTER TABLE public.background_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace agents" ON public.background_agents FOR SELECT TO authenticated USING (workspace_id IS NULL OR private.is_workspace_member(workspace_id));

CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.background_agents(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_key text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed','skipped')),
  items_examined int NOT NULL DEFAULT 0,
  items_actioned int NOT NULL DEFAULT 0,
  items_flagged int NOT NULL DEFAULT 0,
  summary text,
  error text
);
CREATE INDEX agent_runs_agent_started_idx ON public.agent_runs (agent_id, started_at DESC);
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace agent runs" ON public.agent_runs FOR SELECT TO authenticated USING (workspace_id IS NULL OR private.is_workspace_member(workspace_id));

CREATE TABLE public.agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.background_agents(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_key text,
  proposal_type text NOT NULL CHECK (proposal_type IN ('bot_profile_copy','cadence_timing','scorer_weights','booking_correction','objection_response')),
  target_table text,
  target_id uuid,
  target_field text,
  current_value jsonb,
  proposed_value jsonb,
  rationale text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_proposals_ws_status_idx ON public.agent_proposals (workspace_id, status, created_at DESC);
GRANT SELECT, UPDATE ON public.agent_proposals TO authenticated;
GRANT ALL ON public.agent_proposals TO service_role;
ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace proposals" ON public.agent_proposals FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));
CREATE POLICY "Admins review workspace proposals" ON public.agent_proposals FOR UPDATE TO authenticated USING (private.is_workspace_admin(workspace_id)) WITH CHECK (private.is_workspace_admin(workspace_id));

CREATE TABLE public.conversation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid,
  thread_key text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  case_id uuid,
  outcome text NOT NULL,
  objection_category text,
  sentiment text CHECK (sentiment IN ('positive','neutral','negative','distressed')),
  touches_before_outcome int,
  anchor_days_remaining int,
  bot_profile_id uuid REFERENCES public.bot_profiles(id) ON DELETE SET NULL,
  campaign_step_id uuid REFERENCES public.campaign_steps(id) ON DELETE SET NULL,
  variant_hash text,
  confidence numeric,
  flagged boolean NOT NULL DEFAULT false,
  labeled_at timestamptz NOT NULL DEFAULT now(),
  labeler_version text NOT NULL DEFAULT 'v1',
  superseded_at timestamptz,
  last_message_at timestamptz
);
CREATE INDEX conversation_outcomes_ws_outcome_idx ON public.conversation_outcomes (workspace_id, outcome);
CREATE INDEX conversation_outcomes_profile_idx ON public.conversation_outcomes (bot_profile_id);
CREATE INDEX conversation_outcomes_variant_idx ON public.conversation_outcomes (variant_hash);
CREATE INDEX conversation_outcomes_thread_idx ON public.conversation_outcomes (workspace_id, thread_key) WHERE superseded_at IS NULL;
GRANT SELECT ON public.conversation_outcomes TO authenticated;
GRANT ALL ON public.conversation_outcomes TO service_role;
ALTER TABLE public.conversation_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace outcomes" ON public.conversation_outcomes FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

CREATE TRIGGER background_agents_set_updated_at BEFORE UPDATE ON public.background_agents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();