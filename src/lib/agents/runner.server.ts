/**
 * One scheduler ticks every due agent, per workspace. Every run is logged even
 * when it does nothing, so "ran and found nothing" stays distinguishable from
 * "has not run in days".
 */
import { AGENT_DEFINITIONS } from "./registry.shared";
import { ensureAgentRows, finishRun, startRun, type AgentRow, type RunOutcome } from "./store.server";

const IMPLEMENTED = new Set<string>(AGENT_DEFINITIONS.filter((a) => a.implemented).map((a) => a.key));

async function execute(agent: AgentRow): Promise<RunOutcome> {
  switch (agent.agent_key) {
    case "conversation_labeler": {
      const { runConversationLabeler } = await import("./labeler.server");
      return runConversationLabeler(agent);
    }
    case "hot_lead_scorer": {
      const { runHotLeadScorer } = await import("./scorer.server");
      return runHotLeadScorer(agent);
    }
    case "lead_scout": {
      const { runLeadScout } = await import("./scout.server");
      return runLeadScout(agent);
    }
    default:
      return { status: "skipped", summary: "not implemented yet" };
  }
}

export async function runDueAgents(): Promise<{
  ok: true;
  workspaces: number;
  ran: number;
  skipped: number;
  failed: number;
}> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  // Platform-wide kill switch: the workspace-less registry row.
  const { data: pauseRow } = await db
    .from("background_agents")
    .select("enabled")
    .is("workspace_id", null)
    .eq("agent_key", "all")
    .maybeSingle();
  if ((pauseRow as { enabled?: boolean } | null)?.enabled === false) {
    return { ok: true, workspaces: 0, ran: 0, skipped: 0, failed: 0 };
  }

  const { data: workspaces } = await db.from("workspaces").select("id").limit(1000);
  const ids = ((workspaces ?? []) as Array<{ id: string }>).map((w) => w.id);

  let ran = 0;
  let skipped = 0;
  let failed = 0;
  const now = Date.now();

  for (const workspaceId of ids) {
    const agents = await ensureAgentRows(workspaceId);
    for (const agent of agents) {
      if (!agent.enabled || agent.mode === "off" || !IMPLEMENTED.has(agent.agent_key)) {
        skipped += 1;
        continue;
      }
      const due = !agent.next_run_at || new Date(agent.next_run_at).getTime() <= now;
      if (!due) {
        skipped += 1;
        continue;
      }
      const runId = await startRun(agent);
      try {
        const out = await execute(agent);
        await finishRun(agent, runId, out);
        if (out.status === "failed") failed += 1;
        else ran += 1;
      } catch (err) {
        failed += 1;
        await finishRun(agent, runId, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { ok: true, workspaces: ids.length, ran, skipped, failed };
}