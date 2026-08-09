/**
 * Shared inbound-SMS pipeline used by EVERY provider webhook.
 *
 * Order is a compliance requirement, not a style choice:
 *   1. classify the message (STOP / HELP keywords)
 *   2. record suppression for opt-outs BEFORE anything can reply
 *   3. only then may the AI Warm-Up Bot consider a reply, and only after
 *      passing the same assertCanText gate every other send path uses.
 *
 * A STOP therefore can never reach the bot, on any provider.
 */

import { OPTOUT_RE, HELP_RE, OPTOUT_CONFIRMATION, HELP_RESPONSE } from "@/lib/sms";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any };

/** Minimal send surface so tests and both providers can share this module. */
export type Sender = (
  from: string,
  to: string,
  body: string,
) => Promise<{ status: string; providerSid?: string | null }>;

export type InboundContext = {
  db: Client;
  send: Sender;
  workspaceId: string;
  /** Our number (the message destination). */
  toPhone: string;
  sendingNumberId: string;
  /** The lead's number (the message origin). */
  fromPhone: string;
  body: string;
  leadId?: string | null;
  campaignId?: string | null;
  /** Row id of the stored inbound message, for handoff annotation. */
  inboundMessageId?: string | null;
  /**
   * Conversation key for inbox state. Matches `messages.thread_key`, which is
   * the lead id when known and the provider SID otherwise.
   */
  threadKey?: string | null;
};

export type InboundOutcome = {
  optOut: boolean;
  help: boolean;
  /** A negative keyword ("attorney", "sue", …) halted the sequence. */
  negativeKeyword?: string | null;
  bot: "sent" | "handoff" | "blocked" | "disabled" | "skipped";
};

export function classifyInbound(body: string): { isOptOut: boolean; isHelp: boolean } {
  return { isOptOut: OPTOUT_RE.test(body), isHelp: HELP_RE.test(body) };
}

async function logOutbound(
  ctx: InboundContext,
  body: string,
  res: { status: string; providerSid?: string | null },
  extra: Record<string, unknown> = {},
) {
  await ctx.db.from("messages").insert({
    workspace_id: ctx.workspaceId,
    lead_id: ctx.leadId ?? null,
    sending_number_id: ctx.sendingNumberId,
    direction: "outbound",
    body,
    status: res.status,
    provider_sid: res.providerSid ?? null,
    ...extra,
  });
}

/** The AI Warm-Up Bot. Never called for opt-outs; always gated on suppression. */
async function runBot(ctx: InboundContext): Promise<InboundOutcome["bot"]> {
  if (!ctx.campaignId) return "skipped";

  const { data: campaign } = await ctx.db
    .from("campaigns")
    .select("bot_enabled, bot_config, regulated_vertical, brand_id")
    .eq("id", ctx.campaignId)
    .maybeSingle();
  if (!campaign?.bot_enabled) return "disabled";

  // Same chokepoint as manual and campaign sends. The TCPA time window is
  // waived here: this is a direct reply to an inbound message.
  const { checkCanText, logBlockedSend } = await import("@/lib/optout.server");
  const target = {
    workspaceId: ctx.workspaceId,
    leadId: ctx.leadId ?? null,
    phone: ctx.fromPhone,
    source: `bot:${ctx.campaignId}`,
  };
  const gate = await checkCanText(ctx.db, target);
  if (!gate.ok) {
    await logBlockedSend(ctx.db, target, gate);
    return "blocked";
  }

  const { generateBotReply } = await import("@/lib/bot.server");
  const { buildKnowledgeBrief } = await import("@/lib/bot-training.server");
  const { data: knowledgeRows } = await ctx.db
    .from("bot_knowledge")
    .select("title, content, source_type, source_url")
    .or(
      campaign.brand_id
        ? `campaign_id.eq.${ctx.campaignId},brand_id.eq.${campaign.brand_id}`
        : `campaign_id.eq.${ctx.campaignId}`,
    )
    .order("created_at", { ascending: false })
    .limit(25);

  const outcome = await generateBotReply({
    message: ctx.body,
    config: (campaign.bot_config ?? {}) as Record<string, never>,
    regulated: !!campaign.regulated_vertical,
    knowledge: buildKnowledgeBrief(knowledgeRows ?? []),
    profile: profile,
  });

  if (outcome.action === "reply") {
    try {
      const res = await ctx.send(ctx.toPhone, ctx.fromPhone, outcome.body);
      await logOutbound(ctx, outcome.body, res, { campaign_id: ctx.campaignId, is_bot: true });
      return "sent";
    } catch {
      return "handoff"; // thread stays in the inbox for a human
    }
  }

  if (ctx.inboundMessageId) {
    await ctx.db
      .from("messages")
      .update({ handoff_reason: outcome.reason })
      .eq("id", ctx.inboundMessageId);
  }
  return "handoff";
}

/**
 * Compliance keywords first, bot second. Callers must have already stored the
 * inbound message row (with is_optout) before calling this.
 */
export async function processInbound(ctx: InboundContext): Promise<InboundOutcome> {
  const { isOptOut, isHelp } = classifyInbound(ctx.body);

  if (isOptOut) {
    // Suppression is written before any reply can be generated.
    await ctx.db
      .from("suppression")
      .upsert({ workspace_id: ctx.workspaceId, phone: ctx.fromPhone, reason: "optout" });
    if (ctx.leadId) {
      const { stopSequenceForOptOut } = await import("@/lib/sequence-runner.server");
      await stopSequenceForOptOut(ctx.db, { workspaceId: ctx.workspaceId, leadId: ctx.leadId });
    }
    try {
      const res = await ctx.send(ctx.toPhone, ctx.fromPhone, OPTOUT_CONFIRMATION);
      await logOutbound(ctx, OPTOUT_CONFIRMATION, res);
    } catch {
      /* delivery is best-effort; suppression is already recorded */
    }
    // Nothing left to do on this conversation — get it out of the active inbox.
    await autoArchive(ctx, "optout");
    return { optOut: true, help: false, bot: "skipped" };
  }

  // Negative keywords: legal-risk language halts the sequence and suppresses
  // the contact BEFORE the bot can consider a reply. No confirmation is sent —
  // the last thing a person threatening litigation wants is another text.
  const negative = await checkNegativeKeywords(ctx);
  if (negative) {
    if (ctx.leadId) {
      const { pauseSequenceForSignal } = await import("@/lib/sequence-runner.server");
      await pauseSequenceForSignal(ctx.db, {
        workspaceId: ctx.workspaceId,
        leadId: ctx.leadId,
        reason: `negative_keyword:${negative}`,
      });
    }
    await autoArchive(ctx, "negative_keyword");
    return { optOut: false, help: false, negativeKeyword: negative, bot: "blocked" };
  }

  if (isHelp) {
    try {
      const res = await ctx.send(ctx.toPhone, ctx.fromPhone, HELP_RESPONSE);
      await logOutbound(ctx, HELP_RESPONSE, res);
    } catch {
      /* best-effort */
    }
    return { optOut: false, help: true, bot: "skipped" };
  }

  // A real reply from the lead hands the thread to the bot / a human. The
  // scheduled cadence pauses so we never talk over a live conversation.
  if (ctx.leadId) {
    const { pauseSequenceForInbound } = await import("@/lib/sequence-runner.server");
    await pauseSequenceForInbound(ctx.db, {
      workspaceId: ctx.workspaceId,
      leadId: ctx.leadId,
      reason: "lead_reply",
    });
  }

  return { optOut: false, help: false, bot: await runBot(ctx) };
}

/**
 * Workspace-configurable negative keyword gate. A hit writes a suppression row
 * (so every send path refuses this number from now on) and logs a compliance
 * event with the matched word.
 */
async function checkNegativeKeywords(ctx: InboundContext): Promise<string | null> {
  const { matchNegativeKeyword } = await import("@/lib/negative-keywords");
  const { data: ws } = await ctx.db
    .from("workspaces")
    .select("negative_keywords")
    .eq("id", ctx.workspaceId)
    .maybeSingle();
  const hit = matchNegativeKeyword(
    ctx.body,
    (ws as { negative_keywords: string[] | null } | null)?.negative_keywords ?? null,
  );
  if (!hit) return null;

  await ctx.db.from("suppression").upsert({
    workspace_id: ctx.workspaceId,
    phone: ctx.fromPhone,
    reason: "negative_keyword",
    source: "inbound",
    note: `Matched "${hit.matched}"`,
  });

  try {
    await ctx.db.from("compliance_events").insert({
      workspace_id: ctx.workspaceId,
      phone: ctx.fromPhone,
      lead_id: ctx.leadId ?? null,
      path: "manual",
      reason: "negative_keyword",
      detail: { matched: hit.matched, campaign_id: ctx.campaignId ?? null },
    });
  } catch {
    /* the suppression is the control; logging is best-effort */
  }

  if (ctx.inboundMessageId) {
    await ctx.db
      .from("messages")
      .update({ handoff_reason: `negative_keyword:${hit.matched}` })
      .eq("id", ctx.inboundMessageId);
  }

  console.warn(`[compliance] negative keyword "${hit.matched}" halted sequence for ${ctx.fromPhone}`);
  return hit.matched;
}

/**
 * Archive a conversation the system has decided is closed (opt-out, negative
 * keyword, suppression). The operator can still find it on the Archived tab —
 * this only clears it from the queue of things needing attention.
 */
async function autoArchive(
  ctx: InboundContext,
  reason: "optout" | "negative_keyword" | "suppressed",
): Promise<void> {
  const threadKey = ctx.threadKey ?? ctx.leadId ?? null;
  if (!threadKey) return;
  try {
    await ctx.db.from("thread_states").upsert(
      {
        workspace_id: ctx.workspaceId,
        thread_key: threadKey,
        lead_id: ctx.leadId ?? null,
        archived_at: new Date().toISOString(),
        archived_reason: reason,
        status: reason === "optout" ? "do_not_contact" : "not_interested",
      },
      { onConflict: "workspace_id,thread_key" },
    );
  } catch (err) {
    console.error("[inbound] auto-archive failed:", err);
  }
}
