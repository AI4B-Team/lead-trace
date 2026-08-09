import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { botProfileSchema } from "@/lib/bot-profiles.shared";

const COLUMNS =
  "id, workspace_id, template_id, record_type, name, is_default, opener, context_framing, objections, screening_questions, faqs, tone, escalation_triggers, banned_topics, dispositions, default_campaign_id, updated_at";

export const listBotProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("bot_profiles")
      .select(COLUMNS)
      .or(`workspace_id.eq.${data.workspaceId},workspace_id.is.null`)
      .order("template_id", { ascending: true, nullsFirst: true });
    if (error) throw error;
    return rows ?? [];
  });

export const saveBotProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        profile: botProfileSchema,
        changeNote: z.string().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data.profile;
    const row = { ...fields, workspace_id: data.workspaceId };
    const { recordProfileVersion } = await import("@/lib/bot-profile-versions.server");
    if (id) {
      const { error } = await context.supabase
        .from("bot_profiles")
        .update(row as never)
        .eq("id", id)
        .eq("workspace_id", data.workspaceId);
      if (error) throw error;
      await recordProfileVersion(context.supabase as never, {
        workspaceId: data.workspaceId,
        profileId: id,
        snapshot: row as Record<string, unknown>,
        changeKind: "edit",
        changeSource: "manual",
        changedBy: context.userId,
        changeNote: data.changeNote,
      });
      return { ok: true, id };
    }
    const { data: inserted, error } = await context.supabase
      .from("bot_profiles")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw error;
    const newId = (inserted as { id: string }).id;
    await recordProfileVersion(context.supabase as never, {
      workspaceId: data.workspaceId,
      profileId: newId,
      snapshot: row as Record<string, unknown>,
      changeKind: "create",
      changeSource: "manual",
      changedBy: context.userId,
      changeNote: data.changeNote,
    });
    return { ok: true, id: newId };
  });

/**
 * The instruction history for one profile — what it said, when, and who changed
 * it. Append-only by design; this is the answer to "what was the bot told to
 * say on the day this person complained?".
 */
export const listBotProfileVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), profileId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("bot_profile_versions")
      .select("id, version, snapshot, change_kind, change_source, proposal_id, changed_by, change_note, created_at")
      .eq("workspace_id", data.workspaceId)
      .eq("profile_id", data.profileId)
      .order("version", { ascending: false })
      .limit(100);
    if (error) throw error;
    return rows ?? [];
  });

export const deleteBotProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Snapshot the wording before it disappears: a deleted profile still has to
    // be reconstructable for any conversation it drove.
    const { data: existing } = await context.supabase
      .from("bot_profiles")
      .select(COLUMNS)
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (existing) {
      const { recordProfileVersion } = await import("@/lib/bot-profile-versions.server");
      await recordProfileVersion(context.supabase as never, {
        workspaceId: data.workspaceId,
        profileId: data.id,
        snapshot: existing as Record<string, unknown>,
        changeKind: "delete",
        changeSource: "manual",
        changedBy: context.userId,
        changeNote: "Profile deleted — last known wording preserved here.",
      });
    }
    const { error: delErr } = await context.supabase
      .from("bot_profiles")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (delErr) throw delErr;
    return { ok: true };
  });

/** Copy any profile (including a platform default) into a new template scope. */
export const duplicateBotProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        sourceId: z.string().uuid(),
        templateId: z.string().max(60).nullable(),
        recordType: z.string().max(80).nullable().default(null),
        name: z.string().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: src, error: readErr } = await context.supabase
      .from("bot_profiles")
      .select(COLUMNS)
      .eq("id", data.sourceId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!src) throw new Error("Profile Not Found");
    const s = src as Record<string, unknown>;
    const { data: inserted, error } = await context.supabase
      .from("bot_profiles")
      .insert({
        workspace_id: data.workspaceId,
        template_id: data.templateId,
        record_type: data.recordType,
        name: data.name,
        is_default: false,
        opener: s.opener,
        context_framing: s.context_framing,
        objections: s.objections,
        screening_questions: s.screening_questions,
        faqs: s.faqs,
        tone: s.tone,
        escalation_triggers: s.escalation_triggers,
        banned_topics: s.banned_topics,
        dispositions: s.dispositions,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    const newId = (inserted as { id: string }).id;
    const { recordProfileVersion } = await import("@/lib/bot-profile-versions.server");
    await recordProfileVersion(context.supabase as never, {
      workspaceId: data.workspaceId,
      profileId: newId,
      snapshot: { ...s, name: data.name, template_id: data.templateId, record_type: data.recordType },
      changeKind: "duplicate",
      changeSource: "manual",
      changedBy: context.userId,
      changeNote: `Copied from ${data.sourceId}`,
    });
    return { ok: true, id: newId };
  });

/** Render the exact system prompt this profile produces, guardrails included. */
export const previewAssembledPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        profile: botProfileSchema,
        regulated: z.boolean().default(false),
        recordContext: z.string().max(2000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { buildSystemPrompt } = await import("@/lib/bot.server");
    return {
      prompt: buildSystemPrompt(
        {},
        data.regulated,
        undefined,
        data.profile,
        data.recordContext,
      ),
    };
  });

/** Which profile a given lead resolved to, for the lead detail page. */
export const resolvedProfileForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { resolveProfileForLead } = await import("@/lib/bot-profiles.server");
    try {
      const r = await resolveProfileForLead(context.supabase as never, {
        workspaceId: data.workspaceId,
        leadId: data.leadId,
      });
      return {
        name: r.profile.name,
        matched: r.matched,
        templateId: r.profile.template_id,
        recordType: r.profile.record_type,
        isPlatform: !r.profile.workspace_id,
        error: null as string | null,
      };
    } catch (e) {
      return {
        name: null,
        matched: null,
        templateId: null,
        recordType: null,
        isPlatform: false,
        error: e instanceof Error ? e.message : "Unresolved",
      };
    }
  });
