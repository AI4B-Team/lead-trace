// Server-only campaign runner used by the cron webhook. Duplicates the core
// dispatch logic from tickCampaign but runs under the service role so pg_cron
// can drive it without a user session.

import {
  canMessageRecipient,
  canStartNewDropForRecipient,
  inQuietHoursEverywhere,
} from "@/lib/tcpa";
import { TRUSTED_PROVENANCE } from "@/lib/provenance.shared";

type SendWindow = { quiet_start?: string; quiet_end?: string };

function renderTemplate(body: string, lead: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (_, key: string) => {
    const v = lead[key];
    return v == null ? "" : String(v);
  });
}

export async function tickCampaignById(campaignId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, workspace_id, list_job_id, status, daily_cap, send_window, drop_size")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { dispatched: 0, reason: "not_found" };
  if (campaign.status !== "sending") return { dispatched: 0, reason: "not_sending" };
  return tickOne(campaign);
}

export async function tickAllSendingCampaigns() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: campaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id, workspace_id, list_job_id, status, daily_cap, send_window, drop_size")
    .eq("status", "sending");

  const results: Array<{ campaignId: string; dispatched: number; reason: string }> = [];

  for (const campaign of campaigns ?? []) {
    const r = await tickOne(campaign);
    results.push({ campaignId: campaign.id, ...r });
  }

  return { ok: true, ticked: results.length, results };
}

async function tickOne(campaign: {
  id: string;
  workspace_id: string;
  list_job_id: string | null;
  daily_cap: number | null;
  send_window: unknown;
  drop_size?: number | null;
}): Promise<{ dispatched: number; reason: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!campaign.list_job_id) return { dispatched: 0, reason: "no_list" };

  const { data: reg } = await supabaseAdmin
    .from("registrations").select("campaign_status").eq("workspace_id", campaign.workspace_id).maybeSingle();
  if (reg?.campaign_status !== "approved") return { dispatched: 0, reason: "10dlc_not_approved" };

  // Coarse pre-filter only: skip the campaign when the quiet window is active
  // in EVERY US timezone. The authoritative check is per recipient below, in
  // the recipient's own timezone.
  const sendWindow = campaign.send_window as SendWindow | null;
  if (inQuietHoursEverywhere(sendWindow)) {
    return { dispatched: 0, reason: "quiet_hours" };
  }

  // Workspace-level monthly SMS cap (super admin can set this to keep comped
  // accounts safe). null = unlimited.
  const { data: ws } = await supabaseAdmin
    .from("workspaces").select("monthly_sms_cap").eq("id", campaign.workspace_id).maybeSingle();
  const monthlyCap = (ws as { monthly_sms_cap: number | null } | null)?.monthly_sms_cap ?? null;
  let remainingMonthly = Number.POSITIVE_INFINITY;
  if (typeof monthlyCap === "number") {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { count: sentMonth } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", campaign.workspace_id)
      .eq("direction", "outbound")
      .gte("created_at", monthStart.toISOString());
    remainingMonthly = Math.max(0, monthlyCap - (sentMonth ?? 0));
    if (remainingMonthly === 0) return { dispatched: 0, reason: "monthly_cap_reached" };
  }

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const { count: sentToday } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("direction", "outbound")
    .gte("created_at", startOfDay.toISOString());
  const cap = campaign.daily_cap ?? 500;
  const remainingCap = Math.max(0, cap - (sentToday ?? 0));
  if (remainingCap === 0) return { dispatched: 0, reason: "daily_cap_reached" };

  const { data: steps } = await supabaseAdmin
    .from("campaign_steps").select("*").eq("campaign_id", campaign.id).order("step_order");
  if (!steps?.length) return { dispatched: 0, reason: "no_steps" };
  // Touch 1 only. Touches 2..n are owned by lead_sequence_state and driven by
  // runSequenceTick — see sequence-runner.server.ts.
  const step1 = steps[0] as { message_variants: string[] };

  const { data: numbers } = await supabaseAdmin
    .from("sending_numbers")
    .select("id, phone, status, health_score, activated_at, daily_cap_override, auto_paused_at")
    .eq("workspace_id", campaign.workspace_id)
    .in("status", ["active"])
    .is("auto_paused_at", null)
    .order("health_score", { ascending: false });
  if (!numbers?.length) return { dispatched: 0, reason: "no_numbers" };

  // Rate limiting is per DID, never per campaign: two campaigns sharing a
  // number must share its daily budget. Warmup age sets the ceiling and an
  // operator override can only lower it.
  const { getProvider, isProviderConfigured } = await import("@/lib/sms");
  const { perNumberDailyCap } = await import("@/lib/deliverability.server");
  const startOfDayIso = startOfDay.toISOString();
  const numberState = new Map<
    string,
    { phone: string; sentToday: number; cap: number }
  >();
  for (const n of numbers) {
    const { count } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sending_number_id", n.id)
      .eq("direction", "outbound")
      .gte("created_at", startOfDayIso);
    numberState.set(n.id, {
      phone: n.phone,
      sentToday: count ?? 0,
      cap: perNumberDailyCap(n),
    });
  }

  // Single source of truth for opt-out / suppression (see optout.server.ts).
  const { loadSuppressionSet, loadOptedOutLeadIds, logBlockedSend } = await import("@/lib/optout.server");
  const suppressed = await loadSuppressionSet(supabaseAdmin, campaign.workspace_id);
  const optedOut = await loadOptedOutLeadIds(supabaseAdmin, campaign.workspace_id);

  const { data: prevMsgs } = await supabaseAdmin
    .from("messages").select("lead_id").eq("campaign_id", campaign.id).eq("direction", "outbound");
  const messaged = new Set((prevMsgs ?? []).map((m) => m.lead_id).filter(Boolean) as string[]);

  // Drop gating: first touches only go out inside a scheduled, due drop and
  // only up to that drop's remaining size.
  const { data: dueDrops } = await supabaseAdmin
    .from("campaign_drops")
    .select("id, drop_index, size, sent_count, status, scheduled_at")
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "sending"])
    .lte("scheduled_at", new Date().toISOString())
    .order("drop_index")
    .limit(1);
  const activeDrop = dueDrops?.[0] ?? null;
  const { count: totalDrops } = await supabaseAdmin
    .from("campaign_drops")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id);
  if ((totalDrops ?? 0) > 0 && !activeDrop) return { dispatched: 0, reason: "no_drop_due" };
  const dropRoom = activeDrop
    ? Math.max(0, (activeDrop.size ?? 0) - (activeDrop.sent_count ?? 0))
    : Number.POSITIVE_INFINITY;
  if (dropRoom === 0) return { dispatched: 0, reason: "drop_complete" };

  const take = Math.min(remainingCap, remainingMonthly, dropRoom, 50);
  // Keyset pagination that skips leads already messaged on this campaign. A
  // plain LIMIT would keep returning the same first page of already-contacted
  // leads once the campaign is past its first batch, stalling it forever.
  const wanted = take * 4;
  const leads: Array<{
    id: string; full_name: string | null; phone: string | null;
    phone_type: string | null; city: string | null; state: string | null; address: string | null;
  }> = [];
  let cursor: string | null = null;
  let anyRows = false;
  for (let page = 0; page < 20 && leads.length < wanted; page++) {
    let q = supabaseAdmin
      .from("leads")
      .select("id, full_name, phone, phone_type, city, state, address")
      .eq("job_id", campaign.list_job_id)
      .eq("scrub_status", "clean")
      // Records with no verified provenance are never contactable.
      .in("data_provenance", TRUSTED_PROVENANCE)
      .order("id")
      .limit(500);
    if (cursor) q = q.gt("id", cursor);
    const { data: pageRows } = await q;
    if (!pageRows?.length) break;
    anyRows = true;
    cursor = pageRows[pageRows.length - 1]!.id;
    for (const l of pageRows) {
      if (messaged.has(l.id)) continue;
      leads.push(l as (typeof leads)[number]);
      if (leads.length >= wanted) break;
    }
    if (pageRows.length < 500) break;
  }
  if (!anyRows) {
    await supabaseAdmin.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
    return { dispatched: 0, reason: "list_exhausted" };
  }
  if (!leads.length) {
    await supabaseAdmin.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
    return { dispatched: 0, reason: "list_exhausted" };
  }

  const blocked: Array<{ id: string; phone: string; reason: "opted_out" | "suppressed" }> = [];
  // Recipients skipped only because of the clock (quiet hours / after 6pm in
  // their own timezone). They are still eligible on a later tick, so they must
  // never count as "list exhausted".
  let timeDeferred = 0;
  const toSend = leads
    .filter((l) => {
      if (!l.phone) return false;
      if (optedOut.has(l.id)) {
        blocked.push({ id: l.id, phone: l.phone, reason: "opted_out" });
        return false;
      }
      if (suppressed.has(l.phone) || suppressed.has(l.phone.replace(/\D/g, ""))) {
        blocked.push({ id: l.id, phone: l.phone, reason: "suppressed" });
        return false;
      }
      return !messaged.has(l.id);
    })
    // TCPA (authoritative): the statutory 8am–9pm window AND the campaign's
    // quiet window, both evaluated in the recipient's timezone resolved from
    // area code then property state. Unknown timezone = blocked.
    .filter((l) => {
      // 6pm rule: never START a first touch after 6pm recipient local time.
      const ok =
        canMessageRecipient(l.phone as string, l.state, sendWindow) &&
        canStartNewDropForRecipient(l.phone as string, l.state);
      if (!ok) timeDeferred += 1;
      return ok;
    })
    .slice(0, take);

  // Phone verification pre-drip: the number must be live and mobile NOW, not
  // just when the list was built. Landlines and VoIP are dropped here rather
  // than burning a send and eating a carrier failure.
  const { classifyLineType, isTextable } = await import("@/lib/line-type");
  const verified: typeof toSend = [];
  for (const lead of toSend) {
    const stored = (lead as { phone_type?: string | null }).phone_type;
    const lineType = stored && stored !== "unknown" ? stored : classifyLineType(lead.phone);
    if (stored !== lineType) {
      await supabaseAdmin.from("leads").update({ phone_type: lineType }).eq("id", lead.id);
    }
    if (!isTextable(lineType as "mobile" | "landline" | "voip" | "unknown")) continue;
    verified.push(lead);
  }

  for (const b of blocked.slice(0, 50)) {
    await logBlockedSend(
      supabaseAdmin,
      { workspaceId: campaign.workspace_id, leadId: b.id, source: `campaign_runner:${campaign.id}` },
      { ok: false, reason: b.reason, message: "blocked", phone: b.phone },
    );
  }

  const provider = isProviderConfigured() ? getProvider() : null;
  // Fail closed: with no configured carrier we do NOT write fake "delivered"
  // rows. Nothing was sent, so nothing is recorded.
  if (!provider) return { dispatched: 0, reason: "sms_provider_not_configured" };
  let dispatched = 0;

  for (const lead of verified) {
    // Final per-recipient re-check: an inbound STOP can land mid-batch.
    const { assertCanText } = await import("@/lib/optout.server");
    try {
      await assertCanText(supabaseAdmin, {
        workspaceId: campaign.workspace_id,
        leadId: lead.id,
        phone: lead.phone,
        source: `campaign_runner:${campaign.id}`,
      });
    } catch {
      continue;
    }
    // Pick the healthiest number that still has warmup headroom.
    const num = numbers.find((n) => {
      const s = numberState.get(n.id)!;
      return s.sentToday < s.cap;
    });
    if (!num) break; // whole pool capped for today
    const state = numberState.get(num.id)!;

    const variants = step1.message_variants;
    const template = variants[Math.floor(Math.random() * variants.length)];
    const first_name = (lead.full_name ?? "").trim().split(/\s+/)[0] ?? "there";
    const body = renderTemplate(template, { ...lead, first_name });

    let providerSid: string | null = null;
    let status = "sent";
    if (provider && lead.phone) {
      try {
        const r = await provider.send(state.phone, lead.phone, body);
        providerSid = r.providerSid;
        status = r.status || "sent";
      } catch (e) {
        status = "failed";
        await supabaseAdmin.from("messages").insert({
          workspace_id: campaign.workspace_id,
          campaign_id: campaign.id,
          lead_id: lead.id,
          sending_number_id: num.id,
          direction: "outbound",
          status: "failed",
          body,
          error_code: (e as Error).message.slice(0, 200),
        } as never);
        continue;
      }
    }

    await supabaseAdmin.from("messages").insert({
      workspace_id: campaign.workspace_id,
      campaign_id: campaign.id,
      lead_id: lead.id,
      sending_number_id: num.id,
      direction: "outbound",
      status,
      body,
      provider_sid: providerSid,
    } as never);
    if (status !== "failed") {
      const { chargeSmsCredits } = await import("@/lib/sms/charge.server");
      await chargeSmsCredits({
        workspaceId: campaign.workspace_id,
        body,
        reason: "sms_send",
      });
    }
    // Hand the lead to the sequence runner: touch 1 is done, schedule touch 2.
    try {
      const { recordSequenceSend } = await import("@/lib/sequence-runner.server");
      await recordSequenceSend(supabaseAdmin as never, {
        workspaceId: campaign.workspace_id,
        campaignId: campaign.id,
        leadId: lead.id,
        sentStep: 0,
      });
    } catch (err) {
      console.error("[campaign-runner] sequence enrollment failed:", err);
    }
    state.sentToday += 1;
    dispatched += 1;
  }

  if (activeDrop && dispatched > 0) {
    const nextSent = (activeDrop.sent_count ?? 0) + dispatched;
    await supabaseAdmin
      .from("campaign_drops")
      .update({
        sent_count: nextSent,
        status: nextSent >= (activeDrop.size ?? 0) ? "complete" : "sending",
      })
      .eq("id", activeDrop.id);
  }

  // Only finish an undropped campaign when the list is genuinely out of
  // contactable leads — not when this tick was short because recipients are
  // asleep in their timezone, which would end the campaign permanently.
  if (!activeDrop && leads.length < take && timeDeferred === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
  }

  // Health scoring: recompute opt-out rate per number and auto-cool/retire.
  for (const n of numbers) {
    const { count: sent } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sending_number_id", n.id)
      .eq("direction", "outbound");
    const { count: opts } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sending_number_id", n.id)
      .eq("is_optout", true);
    if (!sent) continue;
    const rate = (opts ?? 0) / sent;
    const nextStatus = rate >= 0.08 ? "retired" : rate >= 0.05 ? "cooling" : n.status;
    await supabaseAdmin
      .from("sending_numbers")
      .update({
        optout_rate: rate,
        health_score: Math.max(0, Math.round(100 - rate * 1000)),
        status: nextStatus,
      })
      .eq("id", n.id);
  }

  return { dispatched, reason: dispatched ? "ok" : "no_eligible_leads" };
}