import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: tags, error } = await context.supabase
      .from("tags")
      .select("id, name, color")
      .eq("workspace_id", data.workspaceId)
      .order("name");
    if (error) throw error;
    return { tags: tags ?? [] };
  });

// Rename or recolor an existing tag. Workspace membership is enforced by RLS.
export const updateTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(40).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name) patch.name = data.name.trim();
    if (data.color) patch.color = data.color;
    if (!Object.keys(patch).length) return { ok: true };
    const { assertWriterByRow } = await import("./accountability.server");
    await assertWriterByRow(context.supabase, "tags", data.id, context.userId, "Edit Tags");
    const { error } = await context.supabase.from("tags").update(patch as never).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Deleting a tag clears it from any campaign via ON DELETE SET NULL.
export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertWriterByRow } = await import("./accountability.server");
    await assertWriterByRow(context.supabase, "tags", data.id, context.userId, "Delete Tags");
    const { error } = await context.supabase.from("tags").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Inline tag creation from the campaign builder — never navigates away.
export const createTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      name: z.string().min(1).max(40),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertWriter } = await import("./accountability.server");
    await assertWriter(context.supabase, data.workspaceId, context.userId, "Create Tags");
    const { data: tag, error } = await context.supabase
      .from("tags")
      .upsert(
        { workspace_id: data.workspaceId, name: data.name.trim(), color: data.color },
        { onConflict: "workspace_id,name" },
      )
      .select("id, name, color")
      .single();
    if (error) throw error;
    return { tag };
  });

export const listQuickReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("quick_replies")
      .select("id, title, body")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { snippets: rows ?? [] };
  });

// ── Lead / conversation tags ────────────────────────────────────────────────
// Per-contact labels ("callback", "quoted", "not now") applied while working
// the inbox. They draw from the same workspace `tags` vocabulary used by
// campaigns, but attaching one to a lead never changes campaign membership.

export const listLeadTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_tags")
      .select("tag_id, tags(id, name, color)")
      .eq("workspace_id", data.workspaceId)
      .eq("lead_id", data.leadId);
    if (error) throw error;
    const tags = (rows ?? [])
      .map((r) => (r as unknown as { tags: { id: string; name: string; color: string } | null }).tags)
      .filter((t): t is { id: string; name: string; color: string } => !!t);
    return { tags };
  });

// Attach an existing tag, or create it inline by name (type + enter).
export const addLeadTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      leadId: z.string().uuid(),
      tagId: z.string().uuid().optional(),
      name: z.string().min(1).max(40).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertWriter } = await import("./accountability.server");
    await assertWriter(context.supabase, data.workspaceId, context.userId, "Tag Leads");
    let tagId = data.tagId ?? null;
    if (!tagId) {
      if (!data.name) throw new Error("A Tag Name Is Required");
      const { data: tag, error } = await context.supabase
        .from("tags")
        .upsert(
          { workspace_id: data.workspaceId, name: data.name.trim(), color: data.color ?? "#e11d48" },
          { onConflict: "workspace_id,name" },
        )
        .select("id")
        .single();
      if (error) throw error;
      tagId = tag.id;
    }
    const { error: linkErr } = await context.supabase
      .from("lead_tags")
      .upsert(
        { workspace_id: data.workspaceId, lead_id: data.leadId, tag_id: tagId },
        { onConflict: "lead_id,tag_id" },
      );
    if (linkErr) throw linkErr;
    return { ok: true, tagId };
  });

export const removeLeadTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      leadId: z.string().uuid(),
      tagId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertWriter } = await import("./accountability.server");
    await assertWriter(context.supabase, data.workspaceId, context.userId, "Tag Leads");
    const { error } = await context.supabase
      .from("lead_tags")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("lead_id", data.leadId)
      .eq("tag_id", data.tagId);
    if (error) throw error;
    return { ok: true };
  });

export const createQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      title: z.string().min(1).max(60),
      body: z.string().min(1).max(320),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertWriter } = await import("./accountability.server");
    await assertWriter(context.supabase, data.workspaceId, context.userId, "Save Quick Replies");
    const { data: row, error } = await context.supabase
      .from("quick_replies")
      .insert({ workspace_id: data.workspaceId, title: data.title.trim(), body: data.body.trim() })
      .select("id, title, body")
      .single();
    if (error) throw error;
    return { snippet: row };
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertWriterByRow } = await import("./accountability.server");
    await assertWriterByRow(
      context.supabase, "quick_replies", data.id, context.userId, "Delete Quick Replies",
    );
    const { error } = await context.supabase.from("quick_replies").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Per-user theme preference (light default, dark optional).
export const getThemePref = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_prefs")
      .select("theme")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { theme: (data?.theme as "light" | "dark" | undefined) ?? "light" };
  });

export const setThemePref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ theme: z.enum(["light", "dark"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_prefs")
      .upsert({ user_id: context.userId, theme: data.theme, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  });