// Family standard §4: every UI action must also be callable as an authenticated
// HTTP endpoint so the Real Elite hub consumes this app instead of rebuilding it.
// Callers send a Supabase user access token: `Authorization: Bearer <token>`.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ApiScope = "read" | "write";
export type ApiCaller = {
  userId: string | null;
  workspaceIds: string[];
  scopes: ApiScope[];
  /** Set when the caller authenticated with an issued API key. */
  keyId?: string;
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * Verifies the bearer credential and returns the caller plus their workspace
 * scope. Two credential shapes are accepted: an issued LeadTrace API key
 * (`lt_live_…`) or a Supabase user access token (used by the Real Elite hub).
 */
export async function authenticateApiRequest(request: Request): Promise<ApiCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const admin = adminClient();

  const { looksLikeApiKey, hashApiKey } = await import("./api-keys.server");
  if (looksLikeApiKey(token)) {
    const { data: key } = await admin
      .from("api_keys")
      .select("id, workspace_id, scopes, revoked_at, created_by")
      .eq("key_hash", await hashApiKey(token))
      .maybeSingle();
    if (!key || key.revoked_at) return null;
    // Best-effort usage stamp so a stale key is visibly unused in the UI.
    void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
    return {
      userId: key.created_by ?? null,
      workspaceIds: [key.workspace_id],
      scopes: ((key.scopes ?? ["read"]) as ApiScope[]),
      keyId: key.id,
    };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: rows } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", data.user.id);

  return {
    userId: data.user.id,
    workspaceIds: (rows ?? []).map((r) => r.workspace_id),
    scopes: ["read", "write"],
  };
}

/** True when the credential carries the scope this endpoint requires. */
export function hasScope(caller: ApiCaller, scope: ApiScope): boolean {
  return caller.scopes.includes(scope);
}

/** Resolves the workspace the caller asked for, defaulting to their first one. */
export function resolveWorkspace(caller: ApiCaller, requested?: string | null): string | null {
  if (requested) return caller.workspaceIds.includes(requested) ? requested : null;
  return caller.workspaceIds[0] ?? null;
}

export { adminClient as apiAdminClient };