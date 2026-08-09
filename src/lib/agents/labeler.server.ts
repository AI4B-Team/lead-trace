/**
 * P5.8.1 — Conversation Labeler. The substrate every other agent learns from.
 *
 * Strictly read-only against the outreach world: it never sends, never changes
 * lead state, never resolves a disposition. It records what happened.
 */
import { classifyThread, LABELER_VERSION } from "./labeler.shared";
import type { AgentRow, RunOutcome } from "./store.server";

/** How long a thread must be idle before we call it finished. */
const QUIET_HOURS = 72;

type Msg = {
  id: string;
  thread_key: string;
  direction: string;
  body: string | null;
  is_optout: boolean | null;
  handoff_reason: string | null;
  created_at: string;
  lead_id: string | null;
};

export async function runConversationLabeler(agent: AgentRow): Promise<RunOutcome> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const workspaceId = agent.workspace_id;
  if (!workspaceId) return { status: "skipped", summary: "Labeler is workspace-scoped" };

  const cutoff = new Date(Date.now() - QUIET_HOURS * 3_600_000).toISOString();

  const { data: messages, error: msgErr } = await db
    .from("messages")
    .select("id, thread_key, lead_id, direction, body, is_optout, handoff_reason, created_at")
    .eq("workspace_id", workspaceId)
    .not("thread_key", "is", null)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (msgErr) return { status: "failed", error: msgErr.message };

  const threads = new Map<string, Msg[]>();
  for (const m of (messages ?? []) as Msg[]) {
    const list = threads.get(m.thread_key) ?? [];
    list.push(m);
    threads.set(m.thread_key, list);
  }
  if (threads.size === 0) return { status: "ok", summary: "no threads" };

  const keys = [...threads.keys()];
  const [{ data: states }, { data: seq }, { data: existing }] = await Promise.all([
    db
      .from("thread_states")
      .select("id, thread_key, lead_id")
      .eq("workspace_id", workspaceId)
      .in("thread_key", keys),
    db
      .from("lead_sequence_state")
      .select("lead_id, status, disposition, anchor_date")
      .eq("workspace_id", workspaceId),
    db
      .from("conversation_outcomes")
      .select("id, thread_key, last_message_at")
      .eq("workspace_id", workspaceId)
      .is("superseded_at", null)
      .in("thread_key", keys),
  ]);

  const stateByKey = new Map(
    ((states ?? []) as Array<{ id: string; thread_key: string; lead_id: string | null }>).map((s) => [
      s.thread_key,
      s,
    ]),
  );
  const seqByLead = new Map(
    (
      (seq ?? []) as Array<{
        lead_id: string;
        status: string | null;
        disposition: string | null;
        anchor_date: string | null;
      }>
    ).map((s) => [s.lead_id, s]),
  );
  const labeledByKey = new Map(
    ((existing ?? []) as Array<{ id: string; thread_key: string | null; last_message_at: string | null }>)
      .filter((r): r is { id: string; thread_key: string; last_message_at: string | null } => Boolean(r.thread_key))
      .map((r) => [r.thread_key, r]),
  );

  const inserts: Record<string, unknown>[] = [];
  const supersede: string[] = [];
  let examined = 0;
  let flagged = 0;

  for (const [threadKey, msgs] of threads) {
    const lastAt = msgs.at(-1)?.created_at ?? null;
    const leadId = msgs.find((m) => m.lead_id)?.lead_id ?? stateByKey.get(threadKey)?.lead_id ?? null;
    const seqRow = leadId ? seqByLead.get(leadId) : undefined;

    // A conversation is labelable when it is finished: idle past the quiet
    // window, terminal in its sequence, dispositioned, or opted out.
    const eligible =
      (lastAt !== null && lastAt < cutoff) ||
      ["completed", "opted_out", "converted"].includes(seqRow?.status ?? "") ||
      Boolean(seqRow?.disposition) ||
      msgs.some((m) => m.is_optout);
    if (!eligible) continue;

    // Labeled once already: re-label only when new messages arrived since, and
    // keep the old row (superseded) so the history stays auditable.
    const prior = labeledByKey.get(threadKey);
    if (prior && (!lastAt || !prior.last_message_at || lastAt <= prior.last_message_at)) continue;

    examined += 1;
    const label = classifyThread({
      messages: msgs.map((m) => ({
        direction: m.direction,
        body: m.body,
        is_optout: m.is_optout,
        created_at: m.created_at,
      })),
      sequenceStatus: seqRow?.status ?? null,
      disposition: seqRow?.disposition ?? null,
      handoffReason: msgs.find((m) => m.handoff_reason)?.handoff_reason ?? null,
      anchorDate: seqRow?.anchor_date ?? null,
      outcomeAt: lastAt,
    });
    if (label.flagged) flagged += 1;
    if (prior) supersede.push(prior.id);

    inserts.push({
      workspace_id: workspaceId,
      thread_id: stateByKey.get(threadKey)?.id ?? null,
      thread_key: threadKey,
      lead_id: leadId,
      outcome: label.outcome,
      objection_category: label.objectionCategory,
      sentiment: label.sentiment,
      touches_before_outcome: label.touchesBeforeOutcome,
      anchor_days_remaining: label.anchorDaysRemaining,
      confidence: label.confidence,
      flagged: label.flagged,
      labeler_version: LABELER_VERSION,
      last_message_at: lastAt,
    });
  }

  if (supersede.length > 0) {
    await db
      .from("conversation_outcomes")
      .update({ superseded_at: new Date().toISOString() } as never)
      .in("id", supersede);
  }
  // Record type is the dimension every downstream report needs: a foreclosure
  // objection and a roofer objection have nothing to do with each other, and
  // averaging them produces a number that describes neither.
  if (inserts.length > 0) {
    const leadIds = Array.from(
      new Set(inserts.map((i) => i["lead_id"]).filter((v): v is string => typeof v === "string")),
    );
    if (leadIds.length > 0) {
      const { data: leadRows } = await db
        .from("leads")
        .select("id, job_id")
        .eq("workspace_id", workspaceId)
        .in("id", leadIds);
      const jobIds = Array.from(
        new Set(((leadRows ?? []) as Array<{ job_id: string | null }>).map((l) => l.job_id).filter(Boolean)),
      ) as string[];
      const { data: jobRows } = jobIds.length
        ? await db.from("jobs").select("id, record_type").in("id", jobIds)
        : { data: [] };
      const recordTypeByJob = new Map(
        ((jobRows ?? []) as Array<{ id: string; record_type: string | null }>).map((j) => [j.id, j.record_type]),
      );
      const recordTypeByLead = new Map(
        ((leadRows ?? []) as Array<{ id: string; job_id: string | null }>).map((l) => [
          l.id,
          l.job_id ? recordTypeByJob.get(l.job_id) ?? null : null,
        ]),
      );
      for (const row of inserts) {
        const leadId = row["lead_id"];
        row["record_type"] = typeof leadId === "string" ? recordTypeByLead.get(leadId) ?? null : null;
      }
    }
  }
  if (inserts.length > 0) {
    const { error } = await db.from("conversation_outcomes").insert(inserts as never);
    if (error) return { status: "failed", examined, error: error.message };
  }

  return {
    status: "ok",
    examined,
    actioned: inserts.length,
    flagged,
    summary: `labeled=${inserts.length} flagged=${flagged} relabeled=${supersede.length}`,
  };
}