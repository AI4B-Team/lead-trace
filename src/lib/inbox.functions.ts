import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// List of conversation threads for a workspace. One row per unique thread_key,
// annotated with the last message body, direction, timestamp, and unread count.
export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      filter: z
        .enum([
          "all",
          "needs_reply",
          "interested",
          "appointments",
          "ai",
          "unread",
          "optouts",
          "starred",
          "archived",
        ])
        .default("all"),
      // Optional per-contact label filter (inbox-native lead tags).
      tagId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Pull the most recent messages then reduce to threads in JS. Postgrest
    // can't do a DISTINCT ON via the JS client cleanly.
    let q = context.supabase
      .from("messages")
      .select("id, thread_key, direction, body, created_at, read_at, is_optout, lead_id, sending_number_id, campaign_id, is_bot, handoff_reason, channel, call_event, transcript")
      .eq("workspace_id", data.workspaceId)
      .not("thread_key", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.filter === "optouts") q = q.eq("is_optout", true);
    const { data: rows, error } = await q;
    if (error) throw error;

    type Row = NonNullable<typeof rows>[number];
    type Agg = {
      thread_key: string;
      last_body: string | null;
      last_direction: string;
      last_at: string;
      unread: number;
      is_optout: boolean;
      lead_id: string | null;
      campaign_id: string | null;
      inbound: number;
      outbound: number;
      inbound_bodies: string[];
      last_inbound_at: string | null;
      bot_active: boolean;
      handoff: string | null;
      last_channel: string;
      last_call_event: string | null;
      voice_inbound: number;
    };
    const byThread = new Map<string, Agg>();
    for (const r of (rows ?? []) as Row[]) {
      if (!r.thread_key) continue;
      let cur = byThread.get(r.thread_key);
      if (!cur) {
        cur = {
          thread_key: r.thread_key,
          last_body:
            (r as { channel?: string | null }).channel === "voice"
              ? `📞 ${(r as { call_event?: string | null }).call_event === "missed" ? "Missed Call" : "Voicemail"}${
                  (r as { transcript?: string | null }).transcript ? `: ${(r as { transcript?: string | null }).transcript}` : ""
                }`
              : r.body,
          last_direction: r.direction,
          last_at: r.created_at,
          unread: 0,
          is_optout: false,
          lead_id: r.lead_id ?? null,
          campaign_id: r.campaign_id ?? null,
          inbound: 0,
          outbound: 0,
          inbound_bodies: [],
          last_inbound_at: null,
          bot_active: false,
          handoff: null,
          last_channel: (r as { channel?: string | null }).channel ?? "sms",
          last_call_event: (r as { call_event?: string | null }).call_event ?? null,
          voice_inbound: 0,
        };
        byThread.set(r.thread_key, cur);
      }
      if (!cur.lead_id && r.lead_id) cur.lead_id = r.lead_id;
      if (!cur.campaign_id && r.campaign_id) cur.campaign_id = r.campaign_id;
      if (r.is_optout) cur.is_optout = true;
      if (r.handoff_reason && !cur.handoff) cur.handoff = r.handoff_reason;
      if (r.direction === "inbound") {
        cur.inbound += 1;
        if (!r.read_at) cur.unread += 1;
        const rr = r as { channel?: string | null; transcript?: string | null };
        if (rr.channel === "voice") cur.voice_inbound += 1;
        const text = rr.channel === "voice" ? rr.transcript ?? r.body : r.body;
        if (text) cur.inbound_bodies.push(text);
        if (!cur.last_inbound_at) cur.last_inbound_at = r.created_at;
      } else {
        cur.outbound += 1;
        if (r.is_bot && !cur.bot_active) cur.bot_active = true;
      }
    }

    const { classifyIntent, detectBadges, leadScore, sentimentOf } = await import("@/lib/conversation-intel");

    const threads = Array.from(byThread.values());

    // Enrich with lead, campaign and derived intelligence.
    const leadIds = threads.map((t) => t.lead_id).filter((v): v is string => !!v);
    const campaignIds = Array.from(new Set(threads.map((t) => t.campaign_id).filter((v): v is string => !!v)));
    const [leads, campaigns] = await Promise.all([
      leadIds.length
        ? context.supabase
            .from("leads")
            .select("id, full_name, business_name, phone, phone_type, city, state")
            .in("id", leadIds)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      campaignIds.length
        ? context.supabase
            .from("campaigns")
            .select("id, name, status, bot_enabled")
            .in("id", campaignIds)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
    ]);
    const leadMap = new Map(leads.map((l) => [l.id, l]));
    const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

    // Lead-level tags (inbox-managed labels), keyed by lead.
    const leadTagRows = leadIds.length
      ? await context.supabase
          .from("lead_tags")
          .select("lead_id, tags(id, name, color)")
          .eq("workspace_id", data.workspaceId)
          .in("lead_id", leadIds)
          .then((r) => r.data ?? [])
      : [];
    const tagsByLead = new Map<string, Array<{ id: string; name: string; color: string }>>();
    for (const row of leadTagRows as unknown as Array<{
      lead_id: string;
      tags: { id: string; name: string; color: string } | null;
    }>) {
      if (!row.tags) continue;
      const list = tagsByLead.get(row.lead_id) ?? [];
      list.push(row.tags);
      tagsByLead.set(row.lead_id, list);
    }

    const { computeNeedsReply, urgencyScore } = await import("@/lib/conversation-intel");

    // Workflow state (star / archive / status) for these conversations.
    const { data: stateRows } = await context.supabase
      .from("thread_states")
      .select("thread_key, starred, archived_at, archived_reason, status")
      .eq("workspace_id", data.workspaceId);
    const stateByThread = new Map(
      ((stateRows ?? []) as Array<{
        thread_key: string;
        starred: boolean;
        archived_at: string | null;
        archived_reason: string | null;
        status: string | null;
      }>).map((s) => [s.thread_key, s]),
    );

    const enriched = threads.map((t) => {
      const lead = t.lead_id ? leadMap.get(t.lead_id) ?? null : null;
      const campaign = t.campaign_id ? campaignMap.get(t.campaign_id) ?? null : null;
      const intent = classifyIntent(t.inbound_bodies.join(" "), t.is_optout);
      const badges = detectBadges(t.inbound_bodies, t.is_optout);
      const score = leadScore({
        inboundCount: t.inbound,
        outboundCount: t.outbound,
        intent,
        lastAt: t.last_at,
        isOptout: t.is_optout,
        hasPhoneType: lead?.phone_type ?? null,
      });
      const needs_reply = computeNeedsReply({
        lastDirection: t.last_direction,
        isOptout: t.is_optout,
        botEnabled: !!(campaign as { bot_enabled?: boolean } | null)?.bot_enabled,
        handoff: t.handoff,
        intent,
        lastChannel: t.last_channel,
        lastCallEvent: t.last_call_event,
      });
      return {
        ...t,
        starred: stateByThread.get(t.thread_key)?.starred ?? false,
        archived: !!stateByThread.get(t.thread_key)?.archived_at,
        archived_reason: stateByThread.get(t.thread_key)?.archived_reason ?? null,
        status: stateByThread.get(t.thread_key)?.status ?? null,
        lead,
        lead_tags: t.lead_id ? tagsByLead.get(t.lead_id) ?? [] : [],
        campaign,
        intent,
        badges,
        score,
        sentiment: sentimentOf(t.inbound_bodies.join(" ")),
        needs_reply,
        bot_handling: !!(campaign as { bot_enabled?: boolean } | null)?.bot_enabled,
        urgency: urgencyScore({
          score,
          waitingSince: t.last_inbound_at ?? t.last_at,
          isCallback: t.last_channel === "voice" && t.last_direction === "inbound",
        }),
      };
    });

    const tagScoped = data.tagId
      ? enriched.filter((t) => t.lead_tags.some((tg) => tg.id === data.tagId))
      : enriched;

    let filtered = tagScoped.filter((t) => {
      // Archived conversations only appear on their own tab, never mixed in.
      if (t.archived && data.filter !== "archived") return false;
      switch (data.filter) {
        case "unread":
          return t.unread > 0;
        case "starred":
          return t.starred;
        case "archived":
          return t.archived;
        case "needs_reply":
          return t.needs_reply;
        case "interested":
          return t.intent === "qualified" || t.intent === "appointment";
        case "appointments":
          return t.intent === "appointment";
        case "ai":
          return t.bot_active;
        case "optouts":
          return t.is_optout;
        default:
          return true;
      }
    });

    // The needs-reply surface is ordered by urgency, not raw recency.
    if (data.filter === "needs_reply") {
      filtered = [...filtered].sort((a, b) => b.urgency - a.urgency);
    }

    // Counts drive the filter chips so operators see where attention is needed.
    const counts = {
      // Every count except `archived` describes the active inbox.
      all: enriched.filter((t) => !t.archived).length,
      needs_reply: enriched.filter((t) => !t.archived && t.needs_reply).length,
      interested: enriched.filter(
        (t) => !t.archived && (t.intent === "qualified" || t.intent === "appointment"),
      ).length,
      appointments: enriched.filter((t) => !t.archived && t.intent === "appointment").length,
      ai: enriched.filter((t) => !t.archived && t.bot_active).length,
      unread: enriched.filter((t) => !t.archived && t.unread > 0).length,
      optouts: enriched.filter((t) => !t.archived && t.is_optout).length,
      starred: enriched.filter((t) => !t.archived && t.starred).length,
      archived: enriched.filter((t) => t.archived).length,
    };

    return { threads: filtered, counts };
  });

// Full message list for one thread, plus lead detail.
export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      threadKey: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: messages, error } = await context.supabase
      .from("messages")
      .select("id, direction, body, status, created_at, is_optout, is_bot, handoff_reason, provider_sid, sending_number_id, lead_id, campaign_id, error_code, read_at, channel, call_event, recording_url, recording_seconds, transcript")
      .eq("workspace_id", data.workspaceId)
      .eq("thread_key", data.threadKey)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const leadId = messages?.find((m) => m.lead_id)?.lead_id ?? null;
    const numberId = messages?.find((m) => m.sending_number_id)?.sending_number_id ?? null;
    const campaignId = messages?.find((m) => m.campaign_id)?.campaign_id ?? null;
    const [lead, number, campaign] = await Promise.all([
      leadId
        ? context.supabase
            .from("leads")
            .select("id, full_name, business_name, phone, phone_type, email, city, state, zip, address, job_id, scrub_status, source_meta, created_at")
            .eq("id", leadId)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      numberId
        ? context.supabase.from("sending_numbers").select("id, phone, area_code, health_score").eq("id", numberId).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
      campaignId
        ? context.supabase
            .from("campaigns")
            .select("id, name, status, brand_id, tag_id, list_job_id")
            .eq("id", campaignId)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
    ]);

    // Surrounding context: source job, drip depth, brand, tag, and the
    // cross-list rollup record for this phone.
    const [job, steps, brand, tag, record, suppressed] = await Promise.all([
      lead?.job_id
        ? context.supabase.from("jobs").select("id, name, source_type, record_type, params").eq("id", lead.job_id).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
      campaign
        ? context.supabase.from("campaign_steps").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).then((r) => r.count ?? 0)
        : Promise.resolve(0),
      campaign?.brand_id
        ? context.supabase.from("brands").select("id, name, description").eq("id", campaign.brand_id).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
      campaign?.tag_id
        ? context.supabase.from("tags").select("id, name, color").eq("id", campaign.tag_id).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
      lead?.phone
        ? context.supabase
            .from("lead_records")
            .select("disposition, source_types, record_types, list_count, first_seen_at")
            .eq("workspace_id", data.workspaceId)
            .eq("phone", lead.phone)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      lead?.phone
        ? context.supabase
            .from("suppression")
            .select("phone, reason")
            .eq("workspace_id", data.workspaceId)
            .eq("phone", lead.phone)
            .maybeSingle()
            .then((r) => !!r.data)
        : Promise.resolve(false),
    ]);

    const handoff = messages?.find((m) => m.handoff_reason)?.handoff_reason ?? null;
    const touchCount = (messages ?? []).filter((m) => m.direction === "outbound").length;
    return {
      messages: messages ?? [],
      lead,
      number,
      handoff,
      campaign: campaign ? { ...campaign, step_count: steps, touch: touchCount } : null,
      job,
      brand,
      tag,
      record,
      suppressed,
    };
  });

// Mark all inbound messages in a thread as read.
export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      threadKey: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId)
      .eq("thread_key", data.threadKey)
      .eq("direction", "inbound")
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });

// Send a manual reply within a thread. Uses the most recent sending number
// used in the thread; falls back to the healthiest active number.
export const sendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      threadKey: z.string().min(1),
      body: z.string().min(1).max(1600),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Role gate first: viewers are read-only and must never send outbound SMS.
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "launch_campaign");
    const { data: existing } = await context.supabase
      .from("messages")
      .select("lead_id, sending_number_id")
      .eq("workspace_id", data.workspaceId)
      .eq("thread_key", data.threadKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) throw new Error("Thread not found");

    const { data: lead } = existing.lead_id
      ? await context.supabase.from("leads").select("phone").eq("id", existing.lead_id).maybeSingle()
      : { data: null };
    const toPhone = lead?.phone;
    if (!toPhone) throw new Error("No phone on lead");

    // Authoritative TCPA gate — independent of the UI's disabled state.
    const { assertCanText } = await import("@/lib/optout.server");
    await assertCanText(context.supabase, {
      workspaceId: data.workspaceId,
      leadId: existing.lead_id,
      threadKey: data.threadKey,
      phone: toPhone,
      source: "inbox_reply",
      actorId: context.userId,
    });

    let fromNumber = existing.sending_number_id
      ? (await context.supabase.from("sending_numbers").select("id, phone").eq("id", existing.sending_number_id).maybeSingle()).data
      : null;
    if (!fromNumber) {
      fromNumber = (await context.supabase
        .from("sending_numbers")
        .select("id, phone")
        .eq("workspace_id", data.workspaceId)
        .eq("status", "active")
        .order("health_score", { ascending: false })
        .limit(1)
        .maybeSingle()).data;
    }
    if (!fromNumber) throw new Error("No active sending number");

    const { isProviderConfigured, getProvider } = await import("@/lib/sms");
    let providerSid: string | null = null;
    let status = "sent";
    if (isProviderConfigured()) {
      const r = await getProvider().send(fromNumber.phone, toPhone, data.body);
      providerSid = r.providerSid;
      status = r.status || "sent";
    }

    const { error } = await context.supabase.from("messages").insert({
      workspace_id: data.workspaceId,
      lead_id: existing.lead_id,
      sending_number_id: fromNumber.id,
      direction: "outbound",
      body: data.body,
      status,
      provider_sid: providerSid,
      thread_key: data.threadKey,
    });
    if (error) throw error;
    // A teammate is now handling this conversation: hold the automated cadence
    // for the workspace's pause window instead of talking over them.
    if (existing.lead_id) {
      const { pauseSequenceForHuman } = await import("@/lib/sequence-runner.server");
      await pauseSequenceForHuman(context.supabase as never, {
        workspaceId: data.workspaceId,
        leadId: existing.lead_id,
      });
    }
    return { ok: true, status };
  });

// Small badge counter for the sidebar.
export const unreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("direction", "inbound")
      .is("read_at", null);
    return { count: count ?? 0 };
  });
// ---------------------------------------------------------------------------
// AI layer: conversation summary + suggested replies (grounded in the thread).
// ---------------------------------------------------------------------------

export const summarizeThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), threadKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("workspace_id", data.workspaceId)
      .eq("thread_key", data.threadKey)
      .order("created_at", { ascending: true })
      .limit(40);
    const turns = (rows ?? [])
      .filter((m) => !!m.body)
      .map((m) => ({ role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const), content: m.body! }));
    if (!turns.length) return { summary: null };
    const { summarizeConversation } = await import("@/lib/inbox.server");
    return { summary: await summarizeConversation(turns) };
  });

export const suggestThreadReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      threadKey: z.string().min(1),
      command: z.string().max(40).nullable().optional(),
      draft: z.string().max(1600).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("workspace_id", data.workspaceId)
      .eq("thread_key", data.threadKey)
      .order("created_at", { ascending: true })
      .limit(40);
    const turns = (rows ?? [])
      .filter((m) => !!m.body)
      .map((m) => ({ role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const), content: m.body! }));
    if (!turns.length) return { suggestions: [] };

    // Ground suggestions in the campaign's brand when one is linked.
    const { data: msg } = await context.supabase
      .from("messages")
      .select("campaign_id")
      .eq("workspace_id", data.workspaceId)
      .eq("thread_key", data.threadKey)
      .not("campaign_id", "is", null)
      .limit(1)
      .maybeSingle();
    let brand: string | null = null;
    let product: string | null = null;
    if (msg?.campaign_id) {
      const { data: c } = await context.supabase
        .from("campaigns")
        .select("brand_id, bot_config")
        .eq("id", msg.campaign_id)
        .maybeSingle();
      const cfg = (c?.bot_config ?? {}) as { product?: string };
      product = cfg.product ?? null;
      if (c?.brand_id) {
        const { data: b } = await context.supabase.from("brands").select("name").eq("id", c.brand_id).maybeSingle();
        brand = b?.name ?? null;
      }
    }

    const { suggestReplies } = await import("@/lib/inbox.server");
    const suggestions = await suggestReplies({
      turns,
      brand,
      product,
      command: data.command ?? null,
      draft: data.draft ?? null,
    });
    return { suggestions };
  });

/** Add the lead's phone to workspace suppression (Blacklist quick action). */
export const blacklistThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), threadKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: msg } = await context.supabase
      .from("messages")
      .select("lead_id")
      .eq("workspace_id", data.workspaceId)
      .eq("thread_key", data.threadKey)
      .not("lead_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!msg?.lead_id) throw new Error("No lead on this conversation");
    const { data: lead } = await context.supabase.from("leads").select("phone").eq("id", msg.lead_id).maybeSingle();
    if (!lead?.phone) throw new Error("No phone on this lead");
    const { error } = await context.supabase
      .from("suppression")
      .upsert({
        workspace_id: data.workspaceId,
        phone: lead.phone,
        reason: "manual",
        source: "inbox",
      } as never);
    if (error) throw error;
    return { ok: true, phone: lead.phone };
  });

/* ------------------------------------------------------------------------- *
 * Thread workflow: star, archive, status.
 * State lives in `thread_states`, keyed by (workspace, thread_key), so it
 * survives new messages arriving on the same conversation.
 * ------------------------------------------------------------------------- */

/** Star or unstar a conversation. */
export const starThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        threadKey: z.string().min(1),
        leadId: z.string().uuid().nullish(),
        starred: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("thread_states").upsert(
      {
        workspace_id: data.workspaceId,
        thread_key: data.threadKey,
        lead_id: data.leadId ?? null,
        starred: data.starred,
      },
      { onConflict: "workspace_id,thread_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, starred: data.starred };
  });

/** Archive or restore a conversation. Archiving never deletes messages. */
export const archiveThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        threadKey: z.string().min(1),
        leadId: z.string().uuid().nullish(),
        archived: z.boolean(),
        reason: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("thread_states").upsert(
      {
        workspace_id: data.workspaceId,
        thread_key: data.threadKey,
        lead_id: data.leadId ?? null,
        archived_at: data.archived ? new Date().toISOString() : null,
        archived_reason: data.archived ? data.reason ?? "manual" : null,
      },
      { onConflict: "workspace_id,thread_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, archived: data.archived };
  });

/**
 * Set the workflow status on a conversation and mirror it onto the lead record
 * so the inbox and the Leads library never disagree about where a contact is.
 */
export const setThreadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (input) => {
    const { THREAD_STATUS_VALUES } = await import("@/lib/thread-states.shared");
    return z
      .object({
        workspaceId: z.string().uuid(),
        threadKey: z.string().min(1),
        leadId: z.string().uuid().nullish(),
        status: z.enum(THREAD_STATUS_VALUES).nullable(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("thread_states").upsert(
      {
        workspace_id: data.workspaceId,
        thread_key: data.threadKey,
        lead_id: data.leadId ?? null,
        status: data.status,
        status_set_by: userId,
        status_set_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,thread_key" },
    );
    if (error) throw new Error(error.message);

    // Mirror onto the deduplicated lead record, matched on digits-only phone.
    if (data.leadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("phone")
        .eq("id", data.leadId)
        .maybeSingle();
      const digits = (lead?.phone ?? "").replace(/\D/g, "");
      if (digits) {
        const { data: record } = await supabase
          .from("lead_records")
          .select("id")
          .eq("workspace_id", data.workspaceId)
          .eq("dedupe_key", digits)
          .maybeSingle();
        if (record?.id) {
          await supabase.from("lead_outcomes").upsert(
            {
              workspace_id: data.workspaceId,
              lead_record_id: record.id,
              set_by: userId,
              status: data.status,
              reason: "inbox",
            },
            { onConflict: "lead_record_id" },
          );
        }
      }
    }

    return { ok: true, status: data.status };
  });
