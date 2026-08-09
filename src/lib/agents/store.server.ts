/**
 * Registry, run log and proposal queue plumbing. Agents write through the
 * service-role client because nothing in the browser may create a run, a
 * proposal or an outcome label.
 */
import { AGENT_DEFINITIONS, type AgentKey } from "./registry.shared";
import { assertProposalAllowed, type ProposalDraft } from "./guardrails";

export type AgentRow = {
  id: string;
  workspace_id: string | null;
  agent_key: AgentKey;
  enabled: boolean;
  mode: "flag_only" | "active" | "off";
  interval_minutes: number;
  last_run_at: string | null;
  next_run_at: string | null;
  config: Record<string, unknown>;
  consecutive_failures: number;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Makes sure every known agent has a row for this workspace. New agents always
 * arrive in flag-only mode — never active on an existing workspace.
 */
export async function ensureAgentRows(workspaceId: string): Promise<AgentRow[]> {
  const db = await admin();
  const { data: existing } = await db
    .from("background_agents")
    .select("*")
    .eq("workspace_id", workspaceId);
  const rows = (existing ?? []) as unknown as AgentRow[];
  const missing = AGENT_DEFINITIONS.filter((d) => !rows.some((r) => r.agent_key === d.key));
  if (missing.length > 0) {
    await db.from("background_agents").insert(
      missing.map((d) => ({
        workspace_id: workspaceId,
        agent_key: d.key,
        mode: "flag_only",
        enabled: true,
        interval_minutes: d.intervalMinutes,
      })) as never,
    );
    const { data: after } = await db
      .from("background_agents")
      .select("*")
      .eq("workspace_id", workspaceId);
    return (after ?? []) as unknown as AgentRow[];
  }
  return rows;
}

/** Opens a run row; returns its id so the agent can finish it. */
export async function startRun(agent: AgentRow): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("agent_runs")
    .insert({
      agent_id: agent.id,
      workspace_id: agent.workspace_id,
      agent_key: agent.agent_key,
    } as never)
    .select("id")
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export type RunOutcome = {
  status: "ok" | "failed" | "skipped";
  examined?: number;
  actioned?: number;
  flagged?: number;
  summary?: string;
  error?: string;
};

/** Closes the run row and rolls the schedule. 3 failures disables the agent. */
export async function finishRun(
  agent: AgentRow,
  runId: string | null,
  out: RunOutcome,
): Promise<void> {
  const db = await admin();
  const now = new Date();
  if (runId) {
    await db
      .from("agent_runs")
      .update({
        finished_at: now.toISOString(),
        status: out.status,
        items_examined: out.examined ?? 0,
        items_actioned: out.actioned ?? 0,
        items_flagged: out.flagged ?? 0,
        summary: out.summary ?? null,
        error: out.error ? out.error.slice(0, 500) : null,
      } as never)
      .eq("id", runId);
  }
  const failures = out.status === "failed" ? agent.consecutive_failures + 1 : 0;
  await db
    .from("background_agents")
    .update({
      last_run_at: now.toISOString(),
      next_run_at: new Date(now.getTime() + agent.interval_minutes * 60_000).toISOString(),
      consecutive_failures: failures,
      ...(failures >= 3 ? { enabled: false } : {}),
    } as never)
    .eq("id", agent.id);
  if (failures >= 3) {
    console.error(`[agents] ${agent.agent_key} disabled after 3 consecutive failures`);
  }
}

/** Writes a proposal. Guardrail-weakening drafts throw before they are stored. */
export async function writeProposal(
  agent: AgentRow,
  draft: ProposalDraft & { targetId?: string | null },
): Promise<string | null> {
  assertProposalAllowed(draft);
  if (!agent.workspace_id) throw new Error("Proposals are always workspace-scoped.");
  const db = await admin();
  const { data, error } = await db
    .from("agent_proposals")
    .insert({
      agent_id: agent.id,
      agent_key: agent.agent_key,
      workspace_id: agent.workspace_id,
      proposal_type: draft.proposalType,
      target_table: draft.targetTable ?? null,
      target_id: draft.targetId ?? null,
      target_field: draft.targetField ?? null,
      current_value: (draft.currentValue ?? null) as never,
      proposed_value: (draft.proposedValue ?? null) as never,
      rationale: draft.rationale,
      evidence_refs: (draft.evidenceRefs ?? []) as never,
    } as never)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * One notification per run that produced something for a person to read.
 * Flag-only runs notify too — an agent's first week is only useful if a human
 * is actually reading its output, and silence would defeat that.
 */
export async function notifyRunOutput(agent: AgentRow, out: RunOutcome): Promise<void> {
  if (!agent.workspace_id || out.status !== "ok") return;
  const found = out.flagged ?? 0;
  if (found < 1) return;
  const def = AGENT_DEFINITIONS.find((d) => d.key === agent.agent_key);
  const db = await admin();
  await db.from("notifications").insert({
    workspace_id: agent.workspace_id,
    kind: "agent",
    title: `${def?.name ?? agent.agent_key} Has ${found} Item${found === 1 ? "" : "s"} For You`,
    body: out.summary
      ? `${out.summary} Review On The Background Agents Page.`
      : "Review On The Background Agents Page.",
  } as never);
}