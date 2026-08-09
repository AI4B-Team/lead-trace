/**
 * P5.8.6 — the Wisdom Miner, wired to real threads.
 *
 * A takeover is visible in the message log: an outbound message a person sent
 * (is_bot false) in a thread the bot had been driving. The message just before
 * it, inbound, is what they were answering. Those two lines are the whole signal.
 *
 * Proposals only, permanently. Approval happens in the review queue, which
 * snapshots a new bot profile version carrying the proposal id and the approver.
 */
import { draftWisdom, WISDOM_VERSION, type TakeoverMoment, type WisdomProfileState } from "./wisdom.shared";
import { writeProposal, type AgentRow, type RunOutcome } from "./store.server";

/** How far back to look for takeovers on each run. */
const LOOKBACK_DAYS = 30;

type MessageRow = {
  thread_key: string | null;
  direction: string;
  body: string | null;
  is_bot: boolean;
  channel: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  name: string;
  objections: unknown;
  faqs: unknown;
  is_default: boolean | null;
};

function objections(value: unknown): Array<{ trigger: string; approved_response: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    const o = (v ?? {}) as { trigger?: unknown; approved_response?: unknown };
    return { trigger: String(o.trigger ?? ""), approved_response: String(o.approved_response ?? "") };
  });
}

function faqs(value: unknown): Array<{ q: string; a: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    const o = (v ?? {}) as { q?: unknown; a?: unknown };
    return { q: String(o.q ?? ""), a: String(o.a ?? "") };
  });
}

/**
 * Walks each thread in time order and pairs every human-sent outbound message
 * with the inbound message it answered. What matters is the last thing the lead
 * said before a person stepped in.
 */
export function extractTakeovers(rows: MessageRow[]): TakeoverMoment[] {
  const byThread = new Map<string, MessageRow[]>();
  for (const r of rows) {
    if (!r.thread_key) continue;
    byThread.set(r.thread_key, [...(byThread.get(r.thread_key) ?? []), r]);
  }

  const moments: TakeoverMoment[] = [];
  for (const [threadKey, msgs] of byThread) {
    const ordered = [...msgs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    // Only threads the bot was actually driving: a fully manual thread is a
    // person doing their job, not a correction of the bot.
    if (!ordered.some((m) => m.direction === "outbound" && m.is_bot)) continue;

    let lastInbound: MessageRow | null = null;
    for (const m of ordered) {
      if (m.channel !== "sms") continue;
      if (m.direction === "inbound") {
        if (m.body?.trim()) lastInbound = m;
        continue;
      }
      if (m.direction !== "outbound" || m.is_bot || !m.body?.trim() || !lastInbound) continue;
      moments.push({
        threadKey,
        question: lastInbound.body ?? "",
        humanReply: m.body,
        gapHours:
          (new Date(m.created_at).getTime() - new Date(lastInbound.created_at).getTime()) / 3_600_000,
        outcome: null,
        sentiment: null,
      });
      lastInbound = null; // one capture per question
    }
  }
  return moments;
}

export async function runWisdomMiner(agent: AgentRow): Promise<RunOutcome> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const workspaceId = agent.workspace_id;
  if (!workspaceId) return { status: "skipped", summary: "Wisdom Miner is workspace-scoped" };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const [{ data: profileRows, error: profErr }, { data: messageRows, error: msgErr }] = await Promise.all([
    db.from("bot_profiles").select("id, name, objections, faqs, is_default").eq("workspace_id", workspaceId),
    db
      .from("messages")
      .select("thread_key, direction, body, is_bot, channel, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(8000),
  ]);
  if (profErr) return { status: "failed", error: profErr.message };
  if (msgErr) return { status: "failed", error: msgErr.message };

  const profiles = (profileRows ?? []) as unknown as ProfileRow[];
  if (profiles.length === 0) return { status: "ok", summary: "no workspace profiles to add wording to" };

  const moments = extractTakeovers((messageRows ?? []) as unknown as MessageRow[]);
  if (moments.length === 0) {
    return { status: "ok", examined: 0, summary: "no human takeovers in the last 30 days" };
  }

  // Outcomes are the safety filter: a takeover that ended in an opt-out or a
  // complaint is not wording to keep, whatever it says.
  const keys = [...new Set(moments.map((m) => m.threadKey))];
  const outcomeByThread = new Map<string, { outcome: string; sentiment: string | null }>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data: outcomes } = await db
      .from("conversation_outcomes")
      .select("thread_key, outcome, sentiment")
      .eq("workspace_id", workspaceId)
      .is("superseded_at", null)
      .in("thread_key", keys.slice(i, i + 200));
    for (const o of (outcomes ?? []) as Array<{ thread_key: string | null; outcome: string; sentiment: string | null }>) {
      if (o.thread_key) outcomeByThread.set(o.thread_key, { outcome: o.outcome, sentiment: o.sentiment });
    }
  }
  const enriched = moments.map((m) => ({
    ...m,
    outcome: outcomeByThread.get(m.threadKey)?.outcome ?? null,
    sentiment: outcomeByThread.get(m.threadKey)?.sentiment ?? null,
  }));

  // Captured wording lands on the workspace default profile: it is the profile
  // that speaks when nothing more specific applies.
  const target = profiles.find((p) => p.is_default) ?? profiles[0]!;
  const state: WisdomProfileState = {
    id: target.id,
    name: target.name,
    objections: objections(target.objections),
    faqs: faqs(target.faqs),
  };

  const { data: pending } = await db
    .from("agent_proposals")
    .select("target_id, proposed_value")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", "wisdom_miner")
    .eq("status", "pending");
  const pendingTitles = new Set(
    ((pending ?? []) as Array<{ target_id: string | null; proposed_value: { title?: string } | null }>).map(
      (p) => `${p.target_id}|${p.proposed_value?.title ?? ""}`,
    ),
  );

  const { drafts, rejected } = draftWisdom(state, enriched);
  let filed = 0;
  for (const draft of drafts) {
    if (pendingTitles.has(`${target.id}|${draft.title}`)) continue;
    await writeProposal(agent, {
      proposalType: "bot_copy_edit",
      targetTable: "bot_profiles",
      targetId: target.id,
      targetField: draft.field,
      currentValue: draft.current,
      proposedValue: {
        value: draft.value,
        title: draft.title,
        profile_name: target.name,
        captured: draft.captured,
        wisdom_version: WISDOM_VERSION,
      },
      rationale: draft.rationale,
      evidenceRefs: draft.evidence,
    });
    filed += 1;
  }

  const dropped = Object.values(rejected).reduce((a, b) => a + b, 0);
  return {
    status: "ok",
    examined: enriched.length,
    actioned: 0,
    flagged: filed,
    summary:
      filed === 0
        ? `saw ${enriched.length} human takeover${enriched.length === 1 ? "" : "s"}, none reusable as standing wording`
        : `saw ${enriched.length} human takeovers, captured ${filed} answer${filed === 1 ? "" : "s"} for review` +
          (dropped > 0 ? ` (${dropped} skipped as too personal or too thin)` : ""),
  };
}
