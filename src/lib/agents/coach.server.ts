/**
 * P5.8.5 — the Coach, wired to real data.
 *
 * It reads labeled conversations plus their inbound text, groups them by the bot
 * profile that drove them, and files each drafted wording change as a proposal.
 * It never writes to bot_profiles itself: approval in the review queue is the
 * only path, and that path snapshots a new profile version carrying the
 * proposal id and the approver, so any wording can be reconstructed by date.
 */
import { COACH_VERSION, draftCoachEdits, type CoachConversation, type CoachProfileState } from "./coach.shared";
import { writeProposal, type AgentRow, type RunOutcome } from "./store.server";

/** Only conversations labeled in this window feed a refresh of the drafts. */
const LOOKBACK_DAYS = 60;

type OutcomeRow = {
  thread_key: string | null;
  outcome: string;
  objection_category: string | null;
  sentiment: string | null;
  bot_profile_id: string | null;
};

type ProfileRow = {
  id: string;
  name: string;
  opener: string;
  objections: unknown;
  faqs: unknown;
  escalation_triggers: unknown;
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

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

export async function runCoach(agent: AgentRow): Promise<RunOutcome> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const workspaceId = agent.workspace_id;
  if (!workspaceId) return { status: "skipped", summary: "Coach is workspace-scoped" };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const [{ data: profileRows, error: profErr }, { data: outcomeRows, error: outErr }] = await Promise.all([
    db
      .from("bot_profiles")
      .select("id, name, opener, objections, faqs, escalation_triggers, is_default")
      .eq("workspace_id", workspaceId),
    db
      .from("conversation_outcomes")
      .select("thread_key, outcome, objection_category, sentiment, bot_profile_id")
      .eq("workspace_id", workspaceId)
      .is("superseded_at", null)
      .gte("labeled_at", since)
      .limit(4000),
  ]);
  if (profErr) return { status: "failed", error: profErr.message };
  if (outErr) return { status: "failed", error: outErr.message };

  const profiles = (profileRows ?? []) as unknown as ProfileRow[];
  const outcomes = ((outcomeRows ?? []) as unknown as OutcomeRow[]).filter((o) => o.thread_key);
  if (profiles.length === 0) return { status: "ok", summary: "no workspace profiles to coach" };
  if (outcomes.length === 0) return { status: "ok", summary: "no labeled conversations yet" };

  // Inbound text for those threads. Without it we can only see the label, not
  // what the person actually said.
  const keys = [...new Set(outcomes.map((o) => o.thread_key as string))];
  const inboundByThread = new Map<string, string[]>();
  const outboundThreads = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const { data: msgs } = await db
      .from("messages")
      .select("thread_key, direction, body")
      .eq("workspace_id", workspaceId)
      .in("thread_key", slice)
      .order("created_at", { ascending: true })
      .limit(8000);
    for (const m of (msgs ?? []) as Array<{ thread_key: string | null; direction: string; body: string | null }>) {
      if (!m.thread_key) continue;
      if (m.direction === "outbound") outboundThreads.add(m.thread_key);
      if (m.direction === "inbound" && m.body) {
        inboundByThread.set(m.thread_key, [...(inboundByThread.get(m.thread_key) ?? []), m.body]);
      }
    }
  }

  // Attribution: conversations name their profile when we recorded one. Older
  // threads predate that column, so they fall to the workspace default rather
  // than being silently dropped or spread across every profile.
  const fallback = profiles.find((p) => p.is_default) ?? profiles[0]!;
  const byProfile = new Map<string, CoachConversation[]>();
  for (const o of outcomes) {
    const threadKey = o.thread_key as string;
    const profileId = o.bot_profile_id && profiles.some((p) => p.id === o.bot_profile_id)
      ? o.bot_profile_id
      : fallback.id;
    const inbound = inboundByThread.get(threadKey) ?? [];
    byProfile.set(profileId, [
      ...(byProfile.get(profileId) ?? []),
      {
        threadKey,
        outcome: o.outcome,
        objectionCategory: o.objection_category,
        sentiment: o.sentiment,
        inbound,
        noReply: inbound.length === 0 && outboundThreads.has(threadKey),
      },
    ]);
  }

  // Anything already waiting on a person is not proposed twice.
  const { data: pending } = await db
    .from("agent_proposals")
    .select("target_id, target_field, proposed_value")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", "coach")
    .eq("status", "pending");
  const pendingKeys = new Set(
    ((pending ?? []) as Array<{ target_id: string | null; target_field: string | null; proposed_value: { title?: string } | null }>).map(
      (p) => `${p.target_id}|${p.target_field}|${p.proposed_value?.title ?? ""}`,
    ),
  );

  let examined = 0;
  let filed = 0;

  for (const profile of profiles) {
    const conversations = byProfile.get(profile.id) ?? [];
    if (conversations.length === 0) continue;
    examined += conversations.length;

    const state: CoachProfileState = {
      id: profile.id,
      name: profile.name,
      opener: profile.opener ?? "",
      objections: objections(profile.objections),
      faqs: faqs(profile.faqs),
      escalationTriggers: strings(profile.escalation_triggers),
    };

    for (const draft of draftCoachEdits(state, conversations)) {
      if (pendingKeys.has(`${profile.id}|${draft.field}|${draft.title}`)) continue;
      await writeProposal(agent, {
        proposalType: "bot_copy_edit",
        targetTable: "bot_profiles",
        targetId: profile.id,
        targetField: draft.field,
        currentValue: draft.current,
        proposedValue: {
          value: draft.value,
          title: draft.title,
          profile_name: profile.name,
          coach_version: COACH_VERSION,
          conversations: conversations.length,
        },
        rationale: draft.rationale,
        evidenceRefs: draft.evidence,
      });
      filed += 1;
    }
  }

  return {
    status: "ok",
    examined,
    actioned: 0,
    flagged: filed,
    summary:
      filed === 0
        ? `read ${examined} conversations, nothing worth changing yet`
        : `read ${examined} conversations, drafted ${filed} wording change${filed === 1 ? "" : "s"} for review`,
  };
}