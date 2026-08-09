import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isWorkspaceAdmin, isWorkspaceMember } from "./access-checks";
import { planFor } from "./plans.shared";

async function assertMember(supabase: any, workspaceId: string, userId: string) {
  if (!(await isWorkspaceMember(supabase, workspaceId, userId))) throw new Error("Forbidden");
}

/** Invite management is owner/admin only — a member must not mint admin seats. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, workspaceId: string, userId: string) {
  if (!(await isWorkspaceAdmin(supabase, workspaceId, userId))) {
    throw new Error("Only workspace owners and admins can manage invites.");
  }
}

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members } = await supabaseAdmin
      .from("workspace_members")
      .select("user_id, role, created_at, last_visit_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: true });
    const enriched: Array<{
      user_id: string; email: string; role: string; created_at: string;
      last_visit_at: string | null; is_me: boolean;
    }> = [];
    for (const m of members ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      enriched.push({
        user_id: m.user_id,
        email: u?.user?.email ?? "",
        role: m.role,
        created_at: m.created_at,
        last_visit_at: m.last_visit_at ?? null,
        is_me: m.user_id === context.userId,
      });
    }
    // Invite rows carry the join token, so only owners/admins receive them.
    const isAdmin = await isWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);
    const invites = isAdmin
      ? (
          await supabaseAdmin
            .from("workspace_invites")
            .select("id, email, role, created_at, expires_at, accepted_at, token")
            .eq("workspace_id", data.workspaceId)
            .is("accepted_at", null)
            .order("created_at", { ascending: false })
        ).data
      : [];
    // Seats come from the plan catalog so the UI never shows a made-up number.
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("billing_plan")
      .eq("id", data.workspaceId)
      .maybeSingle();
    const plan = planFor((ws as { billing_plan?: string | null } | null)?.billing_plan);
    return {
      members: enriched,
      invites: invites ?? [],
      seats: { limit: plan.seats, planName: plan.name, planId: plan.id },
    };
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(["admin", "member", "viewer"]).default("member"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Seat ceiling is enforced here: pending invites count against the plan so
    // a workspace can't over-invite and then discover the wall on acceptance.
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("billing_plan")
      .eq("id", data.workspaceId)
      .maybeSingle();
    const plan = planFor((ws as { billing_plan?: string | null } | null)?.billing_plan);
    if (plan.seats !== null) {
      const [{ count: memberCount }, { count: inviteCount }] = await Promise.all([
        supabaseAdmin
          .from("workspace_members")
          .select("user_id", { count: "exact", head: true })
          .eq("workspace_id", data.workspaceId),
        supabaseAdmin
          .from("workspace_invites")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", data.workspaceId)
          .is("accepted_at", null),
      ]);
      const taken = (memberCount ?? 0) + (inviteCount ?? 0);
      if (taken >= plan.seats) {
        throw new Error(
          `The ${plan.name} plan includes ${plan.seats} seat${plan.seats === 1 ? "" : "s"}. Upgrade to invite more teammates.`,
        );
      }
    }
    const { data: existing } = await supabaseAdmin
      .from("workspace_invites")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("email", data.email.toLowerCase())
      .is("accepted_at", null)
      .maybeSingle();
    if (existing) throw new Error("That email already has a pending invite.");
    const { data: row, error } = await supabaseAdmin
      .from("workspace_invites")
      .insert({
        workspace_id: data.workspaceId,
        email: data.email.toLowerCase(),
        role: data.role,
        invited_by: context.userId,
      })
      .select("id, token")
      .single();
    if (error) throw error;
    return { id: row.id, token: row.token };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ inviteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("workspace_invites")
      .select("workspace_id")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (!inv) throw new Error("Not found");
    await assertAdmin(context.supabase, inv.workspace_id, context.userId);
    const { error } = await supabaseAdmin.from("workspace_invites").delete().eq("id", data.inviteId);
    if (error) throw error;
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Removing a seat is an admin action — a member must never be able to
    // remove teammates (including an admin) from the workspace.
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot remove yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (target?.role === "owner") throw new Error("The workspace owner cannot be removed.");
    const { count } = await supabaseAdmin
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId);
    if ((count ?? 0) <= 1) throw new Error("Workspace must have at least one member");
    const { error } = await supabaseAdmin
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const lookupInvite = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, email, role, workspace_id, expires_at, accepted_at, workspaces(name)")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { valid: false as const, reason: "not_found" as const };
    if (inv.accepted_at) return { valid: false as const, reason: "used" as const };
    if (new Date(inv.expires_at) < new Date()) return { valid: false as const, reason: "expired" as const };
    const ws = (inv as any).workspaces as { name?: string } | null;
    return {
      valid: true as const,
      invite: {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        workspaceId: inv.workspace_id,
        workspaceName: ws?.name ?? "Workspace",
      },
    };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, email, role, workspace_id, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("Invite not found");
    if (inv.accepted_at) throw new Error("Invite already used");
    if (new Date(inv.expires_at) < new Date()) throw new Error("Invite expired");

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = userRes?.user?.email?.toLowerCase();
    if (email && email !== inv.email.toLowerCase()) {
      throw new Error(`This invite is for ${inv.email}. Sign in with that email to accept.`);
    }

    const { error: memErr } = await supabaseAdmin
      .from("workspace_members")
      .upsert({ workspace_id: inv.workspace_id, user_id: context.userId, role: inv.role }, { onConflict: "workspace_id,user_id" });
    if (memErr) throw memErr;

    await supabaseAdmin
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    return { ok: true, workspaceId: inv.workspace_id };
  });