/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Membership/role checks done as plain, RLS-scoped table reads.
 *
 * The equivalent SQL helpers (has_role, is_workspace_member, …) now live in the
 * private schema so signed-in users cannot invoke them directly through the
 * API — they exist only for RLS policy evaluation.
 */

export async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function membershipRole(
  supabase: any,
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as string | undefined) ?? null;
}

export async function isWorkspaceMember(supabase: any, workspaceId: string, userId: string) {
  return (await membershipRole(supabase, workspaceId, userId)) !== null;
}

export async function isWorkspaceAdmin(supabase: any, workspaceId: string, userId: string) {
  const role = await membershipRole(supabase, workspaceId, userId);
  return role === "owner" || role === "admin";
}

export async function isWorkspaceOwner(supabase: any, workspaceId: string, userId: string) {
  return (await membershipRole(supabase, workspaceId, userId)) === "owner";
}
