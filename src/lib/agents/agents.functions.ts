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
    const [{ data: runs }, { data: proposals }, { data: outcomes }, { data: decided }] = await Promise.all([
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
        // Nominations are worklist items, not proposals.
        .neq("proposal_type", "lead_nomination")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("conversation_outcomes")
        .select(
          "outcome, objection_category, sentiment, touches_before_outcome, flagged, labeled_at, record_type",
        )
        .eq("workspace_id", data.workspaceId)
        .is("superseded_at", null)
        .order("labeled_at", { ascending: false })
        .limit(1000),
      // The decision trail. Six months after a complaint, this is the answer to
      // "who approved that, and when?" — kept next to the pending queue so the
      // record is visible without an export.
      supabase
        .from("agent_proposals")
        .select(
          "id, agent_key, proposal_type, target_field, rationale, status, reviewed_at, reviewed_by, review_note",
        )
        .eq("workspace_id", data.workspaceId)
        .in("status", ["approved", "rejected"])
        .order("reviewed_at", { ascending: false })
        .limit(25),
    ]);

    // Reviewer emails: a user id in an audit trail is not an answer.
    const reviewerIds = Array.from(
      new Set(
        ((decided ?? []) as Array<{ reviewed_by: string | null }>)
          .map((d) => d.reviewed_by)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const reviewers: Record<string, string> = {};
    if (reviewerIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const uid of reviewerIds) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        reviewers[uid] = u?.user?.email ?? uid.slice(0, 8);
      }
    }
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
      decisions: decided ?? [],
      reviewers,
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

    const { data: reviewed } = await context.supabase
      .from("agent_proposals")
      .select("agent_key, proposal_type, target_field, rationale")
      .eq("id", data.proposalId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();

    // A weight refit is the one proposal type that has an effect on approval:
    // it writes the learned weighting onto the Scorer's own row. Everything
    // else is a record of the decision only.
    if (data.decision === "approved") {
      const { data: proposal } = await context.supabase
        .from("agent_proposals")
        .select("proposal_type, target_table, target_field, target_id, proposed_value")
        .eq("id", data.proposalId)
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      const row = proposal as
        | {
            proposal_type: string;
            target_table: string | null;
            target_field: string | null;
            target_id: string | null;
            proposed_value: { weights?: unknown; value?: unknown } | null;
          }
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

      // An approved Scout nomination is the one place a flag-only agent's
      // output changes a row a person works from: the record joins the
      // shortlist in the Leads library, stamped with the score, the reason,
      // and the member who accepted it. Nothing is texted as a result.
      if (row?.proposal_type === "lead_nomination" && row.target_table === "lead_records" && row.target_id) {
        const value = (row.proposed_value ?? {}) as { score?: unknown; reasons?: unknown };
        const reasons = Array.isArray(value.reasons) ? value.reasons.filter((r): r is string => typeof r === "string") : [];
        const { error: nomErr } = await context.supabase
          .from("lead_records")
          .update({
            nominated_at: new Date().toISOString(),
            nominated_score: typeof value.score === "number" ? Math.round(value.score) : null,
            nominated_reason: reasons.join("; ") || null,
            nominated_by: context.userId,
          } as never)
          .eq("id", row.target_id)
          .eq("workspace_id", data.workspaceId);
        if (nomErr) throw new Error(nomErr.message);
      }

      // A wording change to the bot's own instructions is the highest-risk
      // thing an agent can propose, so it may only ever land here — applied by
      // a named person, and snapshotted as a new profile version carrying the
      // proposal id and the approver. That pair is what makes "what was the bot
      // told to say on this date, and who signed it off?" answerable later.
      if (row?.target_table === "bot_profiles" && row.target_id && row.target_field) {
        const { assertAgentMayWrite } = await import("./guardrails");
        assertAgentMayWrite("bot_profiles", row.target_field);
        const { error: applyErr } = await context.supabase
          .from("bot_profiles")
          .update({ [row.target_field]: row.proposed_value?.value ?? null } as never)
          .eq("id", row.target_id)
          .eq("workspace_id", data.workspaceId);
        if (applyErr) throw new Error(applyErr.message);
        const { data: updated } = await context.supabase
          .from("bot_profiles")
          .select("*")
          .eq("id", row.target_id)
          .eq("workspace_id", data.workspaceId)
          .maybeSingle();
        const { recordProfileVersion } = await import("@/lib/bot-profile-versions.server");
        await recordProfileVersion(context.supabase as never, {
          workspaceId: data.workspaceId,
          profileId: row.target_id,
          snapshot: (updated ?? {}) as Record<string, unknown>,
          changeKind: "edit",
          changeSource: "agent_proposal",
          proposalId: data.proposalId,
          changedBy: context.userId,
          changeNote: data.note ?? `Approved ${row.proposal_type} on ${row.target_field}`,
        });
      }
    }

    // Every decision lands in the activity feed under the deciding member's
    // name, whether it was an approval or a refusal. A rejected proposal is
    // part of the record too: it says a person looked and said no.
    {
      const meta = (reviewed ?? {}) as {
        agent_key?: string | null;
        proposal_type?: string | null;
        target_field?: string | null;
        rationale?: string | null;
      };
      const { agentDefinition } = await import("./registry.shared");
      const agentName = agentDefinition(meta.agent_key ?? "")?.name ?? meta.agent_key ?? "Agent";
      const verb = data.decision === "approved" ? "Approved" : "Rejected";
      const { logActivity } = await import("@/lib/activity.server");
      await logActivity(context.supabase, data.workspaceId, {
        type: "agent_decision",
        summary: `${verb} ${agentName} Proposal${meta.target_field ? ` On ${meta.target_field}` : ""}`,
        detail: data.note ?? meta.rationale ?? null,
        refId: data.proposalId,
        refType: "agent_proposal",
        actorId: context.userId,
      });
    }
    return { ok: true };
  });