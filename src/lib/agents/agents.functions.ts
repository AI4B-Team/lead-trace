import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Agent status, recent runs, pending proposals and the outcome summary. */
export const getBackgroundAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/access-checks");
    if (!(await isWorkspaceMember(context.supabase, data.workspaceId, context.userId))) {
      throw new Error("Forbidden");
    }
    const { ensureAgentRows } = await import("./store.server");
    const agents = await ensureAgentRows(data.workspaceId);
    const { supabase } = context;
    const [{ data: runs }, { data: proposals }, { data: outcomes }] = await Promise.all([
      supabase
        .from("agent_runs")
        .select("id, agent_key, started_at, finished_at, status, items_examined, items_actioned, items_flagged, summary, error")
        .eq("workspace_id", data.workspaceId)
        .order("started_at", { ascending: false })
        .limit(40),
      supabase
        .from("agent_proposals")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("conversation_outcomes")
        .select("outcome, objection_category, sentiment, touches_before_outcome, flagged, labeled_at")
        .eq("workspace_id", data.workspaceId)
        .is("superseded_at", null)
        .order("labeled_at", { ascending: false })
        .limit(1000),
    ]);
    return {
      agents: agents.map((a) => ({
        id: a.id,
        agentKey: a.agent_key,
        mode: a.mode,
        enabled: a.enabled,
        intervalMinutes: a.interval_minutes,
        lastRunAt: a.last_run_at,
        nextRunAt: a.next_run_at,
        consecutiveFailures: a.consecutive_failures,
      })),
      runs: runs ?? [],
      proposals: proposals ?? [],
      outcomes: outcomes ?? [],
    };
  });

export const setAgentMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        agentKey: z.string().min(2).max(64),
        mode: z.enum(["off", "flag_only", "active"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Turning an agent loose on a workspace is an admin decision.
    const { assertAction } = await import("@/lib/accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "manage_limits");
    const { assertModeAllowed } = await import("./guardrails");
    assertModeAllowed(data.agentKey, data.mode);
    const { error } = await context.supabase
      .from("background_agents")
      .update({ mode: data.mode, enabled: data.mode !== "off", consecutive_failures: 0 })
      .eq("workspace_id", data.workspaceId)
      .eq("agent_key", data.agentKey);
    if (error) throw new Error(error.message);
    return { ok: true, mode: data.mode };
  });

/** Approve or reject a proposal. Approval records the decision; nothing an
 * agent proposes is ever applied without passing back through here. */
export const reviewAgentProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        proposalId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAction } = await import("@/lib/accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "decide_approvals");
    const { error } = await context.supabase
      .from("agent_proposals")
      .update({
        status: data.decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        review_note: data.note ?? null,
      })
      .eq("id", data.proposalId)
      .eq("workspace_id", data.workspaceId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    // A weight refit is the one proposal type that has an effect on approval:
    // it writes the learned weighting onto the Scorer's own row. Everything
    // else is a record of the decision only.
    if (data.decision === "approved") {
      const { data: proposal } = await context.supabase
        .from("agent_proposals")
        .select("proposal_type, target_id, proposed_value")
        .eq("id", data.proposalId)
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      const row = proposal as
        | { proposal_type: string; target_id: string | null; proposed_value: { weights?: unknown } | null }
        | null;
      if (row?.proposal_type === "scorer_weights" && row.target_id) {
        const { normaliseWeights } = await import("./scout.shared");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: agentRow } = await supabaseAdmin
          .from("background_agents")
          .select("config")
          .eq("id", row.target_id)
          .eq("workspace_id", data.workspaceId)
          .maybeSingle();
        const config = ((agentRow as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<
          string,
          unknown
        >;
        await supabaseAdmin
          .from("background_agents")
          .update({
            config: {
              ...config,
              weights: normaliseWeights(row.proposed_value?.weights),
              last_fit_at: new Date().toISOString(),
            },
          } as never)
          .eq("id", row.target_id)
          .eq("workspace_id", data.workspaceId);
      }
    }
    return { ok: true };
  });