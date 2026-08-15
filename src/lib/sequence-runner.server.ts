/**
 * Multi-touch sequence runner.
 *
 * Touch 1 stays with the campaign runner (it is drop-sized and throttled).
 * Everything after touch 1 is governed by `lead_sequence_state`: this module
 * advances each enrolled lead through `campaign_steps` on its own schedule.
 *
 * Every send goes through the SAME gates as any other path — assertCanText for
 * opt-out / suppression / DNC / provenance, recipient-local TCPA windows, and
 * per-DID warmup caps. Nothing here duplicates or bypasses them.
 */

import { canMessageRecipient } from "@/lib/tcpa";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any };

export const DEFAULT_HUMAN_PAUSE_DAYS = 4;
const BATCH_SIZE = 200;

type SendWindow = { quiet_start?: string; quiet_end?: string };

function renderTemplate(body: string, lead: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (_, key: string) => {
    const v = lead[key];
    return v == null ? "" : String(v);
  });
}

/** Delay-based schedule for the next touch. Anchor-date math lands in P6. */
export function nextSendAtForStep(
  delayMinutes: number | null | undefined,
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + Math.max(0, delayMinutes ?? 0) * 60_000);
}

/**
 * First moment inside the allowed window for this recipient. We never skip a
 * touch because of quiet hours — we push it forward.
 */
export function nextAllowedSlot(
  phone: string,
  state: string | null | undefined,
  window: SendWindow | null,
  from: Date = new Date(),
): Date {
  const probe = new Date(from.getTime());
  for (let i = 0; i < 48 * 2; i += 1) {
    probe.setTime(probe.getTime() + 30 * 60_000);
    if (canMessageRecipient(phone, state ?? null, window, probe)) return new Date(probe.getTime());
  }
  return new Date(from.getTime() + 12 * 60 * 60_000);
}

/** Enroll eligible leads. Never sends — the tick (or the drop) does that. */
export async function enrollLeadsInSequence(
  db: Client,
  args: {
    workspaceId: string;
    campaignId: string;
    leads: Array<{ id: string; anchorDate?: string | null; anchorType?: string | null }>;
    startAtStep?: number;
  },
): Promise<number> {
  if (!args.leads.length) return 0;
  const now = new Date().toISOString();
  const rows = args.leads.map((l) => ({
    workspace_id: args.workspaceId,
    campaign_id: args.campaignId,
    lead_id: l.id,
    current_step: args.startAtStep ?? 0,
    next_send_at: now,
    anchor_date: l.anchorDate ?? null,
    anchor_type: l.anchorType ?? "none",
    status: "active",
  }));
  const { error } = await db
    .from("lead_sequence_state")
    .upsert(rows, { onConflict: "lead_id,campaign_id", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

/** After touch 1 lands, point the row at the next step. */
export async function recordSequenceSend(
  db: Client,
  args: { workspaceId: string; campaignId: string; leadId: string; sentStep: number },
): Promise<void> {
  const { data: steps } = await db
    .from("campaign_steps")
    .select("step_order, delay_minutes")
    .eq("campaign_id", args.campaignId)
    .order("step_order");
  const list = (steps ?? []) as Array<{ delay_minutes: number | null }>;
  const nextIndex = args.sentStep + 1;
  const nextStep = list[nextIndex];
  const now = new Date();

  const { data: existing } = await db
    .from("lead_sequence_state")
    .select("id, sends_count")
    .eq("campaign_id", args.campaignId)
    .eq("lead_id", args.leadId)
    .maybeSingle();

  const patch = {
    workspace_id: args.workspaceId,
    campaign_id: args.campaignId,
    lead_id: args.leadId,
    current_step: nextIndex,
    sends_count: ((existing?.sends_count as number | undefined) ?? 0) + 1,
    last_sent_at: now.toISOString(),
    status: nextStep ? "active" : "completed",
    next_send_at: nextStep ? nextSendAtForStep(nextStep.delay_minutes, now).toISOString() : null,
  };

  if (existing?.id) {
    await db.from("lead_sequence_state").update(patch).eq("id", existing.id);
  } else {
    await db.from("lead_sequence_state").upsert(patch, { onConflict: "lead_id,campaign_id" });
  }
}

/** A teammate replied by hand: hold automation, but never forever. */
export async function pauseSequenceForHuman(
  db: Client,
  args: { workspaceId: string; leadId: string; campaignId?: string | null },
): Promise<void> {
  const { data: ws } = await db
    .from("workspaces")
    .select("human_pause_days")
    .eq("id", args.workspaceId)
    .maybeSingle();
  const days = (ws as { human_pause_days?: number | null } | null)?.human_pause_days
    ?? DEFAULT_HUMAN_PAUSE_DAYS;
  const until = new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();

  let q = db
    .from("lead_sequence_state")
    .update({ status: "paused_human", paused_until: until, paused_reason: "human_reply" })
    .eq("workspace_id", args.workspaceId)
    .eq("lead_id", args.leadId)
    .eq("status", "active");
  if (args.campaignId) q = q.eq("campaign_id", args.campaignId);
  await q;
}

/** Inbound reply from the lead — the bot owns the thread from here. */
export async function pauseSequenceForInbound(
  db: Client,
  args: { workspaceId: string; leadId: string; reason?: string },
): Promise<void> {
  const { data: ws } = await db
    .from("workspaces")
    .select("human_pause_days")
    .eq("id", args.workspaceId)
    .maybeSingle();
  const days = (ws as { human_pause_days?: number | null } | null)?.human_pause_days
    ?? DEFAULT_HUMAN_PAUSE_DAYS;
  await db
    .from("lead_sequence_state")
    .update({
      status: "paused_human",
      paused_until: new Date(Date.now() + days * 24 * 60 * 60_000).toISOString(),
      paused_reason: args.reason ?? "lead_reply",
    })
    .eq("workspace_id", args.workspaceId)
    .eq("lead_id", args.leadId)
    .eq("status", "active");
}

/** Opt-out is permanent. */
export async function stopSequenceForOptOut(
  db: Client,
  args: { workspaceId: string; leadId: string; reason?: string },
): Promise<void> {
  for (const status of ["active", "paused_human", "paused_signal"]) {
    await db
      .from("lead_sequence_state")
      .update({
        status: "opted_out",
        next_send_at: null,
        paused_reason: args.reason ?? "opted_out",
      })
      .eq("workspace_id", args.workspaceId)
      .eq("lead_id", args.leadId)
      .eq("status", status);
  }
}

/** A compliance/market signal (bankruptcy, MLS listing) halts the cadence. */
export async function pauseSequenceForSignal(
  db: Client,
  args: { workspaceId: string; leadId: string; reason: string },
): Promise<void> {
  await db
    .from("lead_sequence_state")
    .update({ status: "paused_signal", next_send_at: null, paused_reason: args.reason })
    .eq("workspace_id", args.workspaceId)
    .eq("lead_id", args.leadId)
    .eq("status", "active");
}

/** Resume human-paused rows whose hold has expired. Never resumes instantly. */
export async function resumeExpiredHumanPauses(db: Client): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await db
    .from("lead_sequence_state")
    .select("id, workspace_id, lead_id, campaign_id")
    .eq("status", "paused_human")
    .not("paused_until", "is", null)
    .lte("paused_until", nowIso)
    .limit(BATCH_SIZE);
  const rows = (data ?? []) as Array<{
    id: string; workspace_id: string; lead_id: string; campaign_id: string;
  }>;
  for (const row of rows) {
    await db
      .from("lead_sequence_state")
      .update({
        status: "active",
        paused_until: null,
        paused_reason: null,
        next_send_at: nowIso,
      })
      .eq("id", row.id);
    try {
      await db.from("notifications").insert({
        workspace_id: row.workspace_id,
        kind: "sequence_resumed",
        title: "Automation resumed",
        body: "The follow-up sequence for this contact restarted after the manual hold expired.",
        meta: { lead_id: row.lead_id, campaign_id: row.campaign_id },
      });
    } catch {
      /* notification is best-effort */
    }
  }
  return rows.length;
}

type DueRow = {
  id: string;
  workspace_id: string;
  lead_id: string;
  campaign_id: string;
  current_step: number;
  sends_count: number;
};

/**
 * Send every due touch after touch 1. Batched, gated, and idempotent per row:
 * a row is only advanced after the carrier accepts the message.
 */
export async function runSequenceTick(workspaceId?: string): Promise<{
  ok: true; processed: number; sent: number; completed: number; deferred: number; failed: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Client;

  await resumeExpiredHumanPauses(db);

  let q = db
    .from("lead_sequence_state")
    .select("id, workspace_id, lead_id, campaign_id, current_step, sends_count")
    .eq("status", "active")
    .gte("current_step", 1)
    .not("next_send_at", "is", null)
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at")
    .limit(BATCH_SIZE);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data: due } = await q;
  const rows = (due ?? []) as DueRow[];
  if (!rows.length) {
    return { ok: true, processed: 0, sent: 0, completed: 0, deferred: 0, failed: 0 };
  }

  const { getProvider, isProviderConfigured } = await import("@/lib/sms");
  // Fail closed: with no carrier configured nothing is sent and nothing is logged.
  if (!isProviderConfigured()) {
    return { ok: true, processed: 0, sent: 0, completed: 0, deferred: rows.length, failed: 0 };
  }
  const provider = getProvider();
  const { assertCanText } = await import("@/lib/optout.server");
  const { perNumberDailyCap } = await import("@/lib/deliverability.server");
  const { classifyLineType, isTextable } = await import("@/lib/line-type");

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString();

  const campaignCache = new Map<string, any>();
  const stepsCache = new Map<string, Array<{ delay_minutes: number | null; message_variants: string[]; active: boolean | null }>>();
  const numberCache = new Map<string, Array<{ id: string; phone: string; sentToday: number; cap: number }>>();

  let sent = 0, completed = 0, deferred = 0, failed = 0;

  for (const row of rows) {
    // Campaign must still be live.
    if (!campaignCache.has(row.campaign_id)) {
      const { data } = await db
        .from("campaigns")
        .select("id, workspace_id, status, send_window")
        .eq("id", row.campaign_id)
        .maybeSingle();
      campaignCache.set(row.campaign_id, data ?? null);
    }
    const campaign = campaignCache.get(row.campaign_id);
    if (!campaign || !["sending", "active"].includes(campaign.status)) { deferred += 1; continue; }
    const sendWindow = (campaign.send_window ?? null) as SendWindow | null;

    // Steps for this campaign.
    if (!stepsCache.has(row.campaign_id)) {
      const { data } = await db
        .from("campaign_steps")
        .select("step_order, delay_minutes, message_variants, active")
        .eq("campaign_id", row.campaign_id)
        .order("step_order");
      stepsCache.set(row.campaign_id, (data ?? []) as never);
    }
    // current_step is an index into the FULL ordered step list, so inactive
    // steps must be skipped by index — filtering them out would shift every
    // later index and send the wrong touch (or complete the row early).
    const steps = stepsCache.get(row.campaign_id) ?? [];
    let stepIndex = row.current_step;
    while (stepIndex < steps.length && steps[stepIndex]!.active === false) stepIndex += 1;
    const step = steps[stepIndex];
    if (!step) {
      await db.from("lead_sequence_state")
        .update({ status: "completed", current_step: stepIndex, next_send_at: null })
        .eq("id", row.id);
      completed += 1;
      continue;
    }

    const { data: lead } = await db
      .from("leads")
      .select("id, full_name, phone, phone_type, city, state, address")
      .eq("id", row.lead_id)
      .maybeSingle();
    if (!lead?.phone) {
      await db.from("lead_sequence_state")
        .update({ status: "failed", next_send_at: null, paused_reason: "no_phone" })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    // Recipient-local TCPA + campaign quiet window. Outside it we defer, not skip.
    if (!canMessageRecipient(lead.phone, lead.state, sendWindow)) {
      await db.from("lead_sequence_state")
        .update({ next_send_at: nextAllowedSlot(lead.phone, lead.state, sendWindow).toISOString() })
        .eq("id", row.id);
      deferred += 1;
      continue;
    }

    // Suppression / opt-out / DNC / provenance — the one authoritative gate.
    try {
      await assertCanText(db, {
        workspaceId: row.workspace_id,
        leadId: lead.id,
        phone: lead.phone,
        source: `sequence:${row.campaign_id}`,
      });
    } catch {
      await db.from("lead_sequence_state")
        .update({ status: "paused_signal", next_send_at: null, paused_reason: "blocked_by_gate" })
        .eq("id", row.id);
      deferred += 1;
      continue;
    }

    // Line type must still be textable.
    const stored = lead.phone_type as string | null;
    const lineType = stored && stored !== "unknown" ? stored : classifyLineType(lead.phone);
    if (!isTextable(lineType as "mobile" | "landline" | "voip" | "unknown")) {
      await db.from("lead_sequence_state")
        .update({ status: "failed", next_send_at: null, paused_reason: `not_textable:${lineType}` })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    // Per-DID warmup caps, shared across campaigns.
    if (!numberCache.has(row.workspace_id)) {
      const { data: numbers } = await db
        .from("sending_numbers")
        .select("id, phone, status, health_score, activated_at, daily_cap_override, auto_paused_at")
        .eq("workspace_id", row.workspace_id)
        .eq("status", "active")
        .is("auto_paused_at", null)
        .order("health_score", { ascending: false });
      const state: Array<{ id: string; phone: string; sentToday: number; cap: number }> = [];
      for (const n of (numbers ?? []) as any[]) {
        const { count } = await db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sending_number_id", n.id)
          .eq("direction", "outbound")
          .gte("created_at", startOfDayIso);
        state.push({ id: n.id, phone: n.phone, sentToday: count ?? 0, cap: perNumberDailyCap(n) });
      }
      numberCache.set(row.workspace_id, state);
    }
    const pool = numberCache.get(row.workspace_id) ?? [];
    const num = pool.find((n) => n.sentToday < n.cap);
    if (!num) {
      // Whole pool capped for today — retry tomorrow morning, do not skip.
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
      await db.from("lead_sequence_state")
        .update({ next_send_at: tomorrow.toISOString() })
        .eq("id", row.id);
      deferred += 1;
      continue;
    }

    const variants = step.message_variants ?? [];
    if (!variants.length) { deferred += 1; continue; }
    const template = variants[Math.floor(Math.random() * variants.length)];
    const first_name = (lead.full_name ?? "").trim().split(/\s+/)[0] || "there";
    const body = renderTemplate(template, { ...lead, first_name });

    try {
      const res = await provider.send(num.phone, lead.phone, body);
      await db.from("messages").insert({
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        lead_id: lead.id,
        sending_number_id: num.id,
        direction: "outbound",
        status: res.status || "sent",
        body,
        provider_sid: res.providerSid ?? null,
      });
      num.sentToday += 1;

      let nextIndex = stepIndex + 1;
      while (nextIndex < steps.length && steps[nextIndex]!.active === false) nextIndex += 1;
      const nextStep = steps[nextIndex];
      const now = new Date();
      await db.from("lead_sequence_state").update({
        current_step: nextIndex,
        sends_count: (row.sends_count ?? 0) + 1,
        last_sent_at: now.toISOString(),
        status: nextStep ? "active" : "completed",
        next_send_at: nextStep ? nextSendAtForStep(nextStep.delay_minutes, now).toISOString() : null,
      }).eq("id", row.id);
      sent += 1;
      if (!nextStep) completed += 1;
    } catch (e) {
      const message = (e as Error).message.slice(0, 200);
      await db.from("messages").insert({
        workspace_id: row.workspace_id,
        campaign_id: row.campaign_id,
        lead_id: lead.id,
        sending_number_id: num.id,
        direction: "outbound",
        status: "failed",
        body,
        error_code: message,
      });
      await db.from("lead_sequence_state")
        .update({ status: "failed", next_send_at: null, paused_reason: message })
        .eq("id", row.id);
      try {
        await db.from("compliance_events").insert({
          workspace_id: row.workspace_id,
          phone: lead.phone,
          lead_id: lead.id,
          path: "cadence",
          reason: "carrier_failure",
          detail: { campaign_id: row.campaign_id, step: row.current_step, error: message },
        });
      } catch {
        /* logging is best-effort */
      }
      failed += 1;
    }
  }

  return { ok: true, processed: rows.length, sent, completed, deferred, failed };
}
