import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SCOPES = ["read", "write"] as const;

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("api_keys")
      .select("id, name, prefix, scopes, created_at, last_used_at, revoked_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { keys: rows ?? [] };
  });

// Keys are an access grant, so creation is admin/owner-only. The secret is
// returned once here and never retrievable again.
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      name: z.string().min(1).max(60),
      scopes: z.array(z.enum(SCOPES)).min(1).default(["read"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "manage_team");
    const { mintApiKey } = await import("./api-keys.server");
    const { secret, prefix, hash } = await mintApiKey();
    const { data: row, error } = await context.supabase
      .from("api_keys")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name.trim(),
        prefix,
        key_hash: hash,
        scopes: data.scopes,
        created_by: context.userId,
      })
      .select("id, name, prefix, scopes, created_at, last_used_at, revoked_at")
      .single();
    if (error) throw error;
    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, data.workspaceId, {
      type: "api_key_created",
      summary: `API Key Created — ${row.name}`,
      detail: `${prefix}… · scopes: ${data.scopes.join(", ")}`,
      refId: row.id,
      refType: "api_key",
      actorId: context.userId,
    });
    return { key: row, secret };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("api_keys")
      .select("id, name, workspace_id, prefix")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Key Not Found");
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, existing.workspace_id, context.userId, "manage_team");
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, existing.workspace_id, {
      type: "api_key_revoked",
      summary: `API Key Revoked — ${existing.name}`,
      detail: `${existing.prefix}… can no longer authenticate.`,
      refId: existing.id,
      refType: "api_key",
      actorId: context.userId,
    });
    return { ok: true };
  });

// Rotation revokes the old secret and issues a new one under the same name and
// scopes, so an integration can be cut over without losing its audit history.
export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("api_keys")
      .select("id, name, workspace_id, scopes")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Key Not Found");
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, existing.workspace_id, context.userId, "manage_team");
    const { mintApiKey } = await import("./api-keys.server");
    const { secret, prefix, hash } = await mintApiKey();

    await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);

    const { data: row, error } = await context.supabase
      .from("api_keys")
      .insert({
        workspace_id: existing.workspace_id,
        name: existing.name,
        prefix,
        key_hash: hash,
        scopes: existing.scopes,
        created_by: context.userId,
      })
      .select("id, name, prefix, scopes, created_at, last_used_at, revoked_at")
      .single();
    if (error) throw error;
    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, existing.workspace_id, {
      type: "api_key_created",
      summary: `API Key Rotated — ${existing.name}`,
      detail: `New secret ${prefix}… issued; the previous secret is revoked.`,
      refId: row.id,
      refType: "api_key",
      actorId: context.userId,
    });
    return { key: row, secret };
  });
