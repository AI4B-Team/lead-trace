/**
 * P5.8.4 — the Booking Auditor, wired to real threads.
 *
 * Bookings live in two places: a thread a person marked "Appointment Set" and a
 * conversation the Labeler recorded as 'booked'. Both are audited, because the
 * failure that matters — someone driving to a meeting nobody agreed to — looks
 * the same either way.
 *
 * Flags only. It never changes a thread's status, cancels, or replies.
 */
import {
  auditBooking,
  BOOKING_AUDITOR_VERSION,
  rankFindings,
  type AuditMessage,
  type BookingThread,
} from "./booking.shared";
import { writeProposal, type AgentRow, type RunOutcome } from "./store.server";

/** Bookings older than this are history, not something to chase. */
const LOOKBACK_DAYS = 14;
/** Never file more than this in one run: a flood of flags gets ignored. */
const MAX_FINDINGS_PER_RUN = 25;

export async function runBookingAuditor(agent: AgentRow): Promise<RunOutcome> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const workspaceId = agent.workspace_id;
  if (!workspaceId) return { status: "skipped", summary: "Booking Auditor is workspace-scoped" };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const [{ data: threadRows, error: threadErr }, { data: outcomeRows }] = await Promise.all([
    db
      .from("thread_states")
      .select("thread_key, lead_id, status, status_set_at, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "appointment")
      .gte("updated_at", since)
      .limit(500),
    db
      .from("conversation_outcomes")
      .select("thread_key, labeled_at")
      .eq("workspace_id", workspaceId)
      .eq("outcome", "booked")
      .is("superseded_at", null)
      .gte("labeled_at", since)
      .limit(500),
  ]);
  if (threadErr) return { status: "failed", error: threadErr.message };

  const marked = new Map<string, { leadId: string | null; markedAt: string | null }>();
  for (const t of (threadRows ?? []) as Array<{
    thread_key: string;
    lead_id: string | null;
    status_set_at: string | null;
    updated_at: string;
  }>) {
    marked.set(t.thread_key, { leadId: t.lead_id, markedAt: t.status_set_at ?? t.updated_at });
  }
  for (const o of (outcomeRows ?? []) as Array<{ thread_key: string | null; labeled_at: string | null }>) {
    if (!o.thread_key || marked.has(o.thread_key)) continue;
    marked.set(o.thread_key, { leadId: null, markedAt: o.labeled_at });
  }

  const keys = [...marked.keys()];
  if (keys.length === 0) return { status: "ok", examined: 0, summary: "no bookings in the last 14 days" };

  const messagesByThread = new Map<string, AuditMessage[]>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data: msgs } = await db
      .from("messages")
      .select("thread_key, direction, body, is_bot, created_at, channel")
      .eq("workspace_id", workspaceId)
      .in("thread_key", keys.slice(i, i + 100))
      .order("created_at", { ascending: true })
      .limit(6000);
    for (const m of (msgs ?? []) as Array<AuditMessage & { thread_key: string | null; channel: string }>) {
      if (!m.thread_key || m.channel !== "sms") continue;
      messagesByThread.set(m.thread_key, [
        ...(messagesByThread.get(m.thread_key) ?? []),
        { direction: m.direction, body: m.body, is_bot: m.is_bot, created_at: m.created_at },
      ]);
    }
  }

  // Anything already waiting on a person is not flagged twice.
  const { data: pending } = await db
    .from("agent_proposals")
    .select("target_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", "booking_auditor")
    .eq("status", "pending");
  const pendingThreads = new Set(
    ((pending ?? []) as Array<{ target_id: string | null }>).map((p) => p.target_id ?? ""),
  );

  const threads: BookingThread[] = keys.map((key) => ({
    threadKey: key,
    leadId: marked.get(key)!.leadId,
    markedAt: marked.get(key)!.markedAt,
    messages: messagesByThread.get(key) ?? [],
  }));

  const findings = rankFindings(
    threads.map((t) => auditBooking(t)).filter((f): f is NonNullable<typeof f> => f !== null),
  );

  let filed = 0;
  for (const finding of findings.slice(0, MAX_FINDINGS_PER_RUN)) {
    if (pendingThreads.has(finding.threadKey)) continue;
    await writeProposal(agent, {
      proposalType: "booking_review",
      targetTable: "thread_states",
      targetId: finding.threadKey,
      targetField: null,
      currentValue: { status: "appointment" },
      proposedValue: {
        title: "Check This Booking Before Anyone Drives",
        issues: finding.issues,
        reasons: finding.reasons,
        lead_time: finding.leadTime,
        bot_time: finding.botTime,
        lead_id: finding.leadId,
        auditor_version: BOOKING_AUDITOR_VERSION,
      },
      rationale: finding.reasons.join(" "),
      evidenceRefs: finding.evidence,
    });
    filed += 1;
  }

  return {
    status: "ok",
    examined: threads.length,
    actioned: 0,
    flagged: filed,
    summary:
      filed === 0
        ? `re-read ${threads.length} booking${threads.length === 1 ? "" : "s"}, all of them hold up`
        : `re-read ${threads.length} bookings, flagged ${filed} that drifted from what the lead agreed to`,
  };
}
