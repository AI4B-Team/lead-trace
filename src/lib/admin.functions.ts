import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./access-checks";

async function assertSuperAdmin(supabase: any, userId: string) {
  if (!(await isSuperAdmin(supabase, userId))) throw new Error("Forbidden");
}

function startOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// Whether the current user has super_admin. Used to gate the admin nav item.
export const meIsSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return { isSuperAdmin: await isSuperAdmin(context.supabase, context.userId) };
  });

// List every workspace with stats + billing plan. super_admin only.
export const listAllWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: workspaces, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, industry, plan, billing_plan, monthly_sms_cap, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Owner emails
    const ids = (workspaces ?? []).map((w) => w.id);
    const { data: memberRows } = ids.length
      ? await supabaseAdmin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", ids)
      : { data: [] as { workspace_id: string; user_id: string }[] };
    const userIds = [...new Set((memberRows ?? []).map((m) => m.user_id))];
    const emails = new Map<string, string>();
    for (const uid of userIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (u?.user?.email) emails.set(uid, u.user.email);
    }
    const ownerByWs = new Map<string, string>();
    for (const m of memberRows ?? []) if (!ownerByWs.has(m.workspace_id)) {
      ownerByWs.set(m.workspace_id, emails.get(m.user_id) ?? "");
    }

    // Usage stats
    const monthStart = startOfMonthIso();
    const stats = new Map<string, { leads: number; sent: number; sent_month: number; numbers: number }>();
    for (const w of workspaces ?? []) {
      const [{ count: leads }, { count: sent }, { count: sentMonth }, { count: numbers }] = await Promise.all([
        supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", w.id),
        supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("direction", "outbound"),
        supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("direction", "outbound").gte("created_at", monthStart),
        supabaseAdmin.from("sending_numbers").select("id", { count: "exact", head: true }).eq("workspace_id", w.id),
      ]);
      stats.set(w.id, { leads: leads ?? 0, sent: sent ?? 0, sent_month: sentMonth ?? 0, numbers: numbers ?? 0 });
    }

    return {
      workspaces: (workspaces ?? []).map((w) => ({
        ...w,
        owner_email: ownerByWs.get(w.id) ?? "",
        stats: stats.get(w.id) ?? { leads: 0, sent: 0, sent_month: 0, numbers: 0 },
      })),
    };
  });

// Change a workspace's billing plan (comp / uncomp / paid / trial).
export const setBillingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      plan: z.enum(["trial", "paid", "comped", "past_due"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("workspaces")
      .update({ billing_plan: data.plan })
      .eq("id", data.workspaceId);
    if (error) throw error;
    return { ok: true };
  });

// Set the monthly outbound SMS cap. null = unlimited.
export const setMonthlySmsCap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      cap: z.number().int().min(0).max(10_000_000).nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("workspaces")
      .update({ monthly_sms_cap: data.cap })
      .eq("id", data.workspaceId);
    if (error) throw error;
    return { ok: true };
  });

// Grant credits to a workspace without a payment. Used for comped accounts.
export const grantCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      kind: z.enum(["scrape", "skip_trace", "sms"]),
      amount: z.number().int().min(1).max(10_000_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("credit_balances")
      .select("balance")
      .eq("workspace_id", data.workspaceId)
      .eq("kind", data.kind)
      .maybeSingle();
    const next = (existing?.balance ?? 0) + data.amount;
    const { error: upErr } = await supabaseAdmin
      .from("credit_balances")
      .upsert(
        { workspace_id: data.workspaceId, kind: data.kind, balance: next },
        { onConflict: "workspace_id,kind" },
      );
    if (upErr) throw upErr;
    await supabaseAdmin.from("credit_ledger").insert({
      workspace_id: data.workspaceId,
      kind: data.kind,
      delta: data.amount,
      reason: "admin_grant",
    });
    return { balance: next };
  });

// List every super_admin (so an owner can revoke others).
export const listSuperAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "super_admin");
    const admins: Array<{ user_id: string; email: string; created_at: string; is_me: boolean }> = [];
    for (const r of rows ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      admins.push({
        user_id: r.user_id,
        email: u?.user?.email ?? "",
        created_at: r.created_at,
        is_me: r.user_id === context.userId,
      });
    }
    return { admins };
  });

// Revoke another user's super_admin. Cannot revoke your own; cannot leave zero admins.
export const revokeSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot revoke yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) <= 1) throw new Error("At least one super_admin must remain");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "super_admin");
    if (error) throw error;
    return { ok: true };
  });
// Roadmap view of the source-request backlog, grouped so overlapping demand is
// obvious. The RPC re-checks super_admin server-side.
export const listSourceDemand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("adapter_demand");
    if (error) throw error;
    return { demand: data ?? [] };
  });

// Who to email when a requested source ships.
export const listSourceRequesters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sourceKey: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("adapter_request_notify_list", {
      _source_key: data.sourceKey,
    });
    if (error) throw error;
    return { requesters: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// Legacy unverified records. Rows created before source verification was live
// are already blocked from outreach and export; this lets an admin review the
// remaining volume and purge it for good.
// ---------------------------------------------------------------------------

export const countLegacyLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: leads } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("data_provenance", ["mock_legacy", "unknown"]);
    const { count: lists } = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .in("data_provenance", ["mock_legacy", "unknown"]);
    return { leads: leads ?? 0, lists: lists ?? 0 };
  });

export const purgeLegacyLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: before } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("data_provenance", ["mock_legacy", "unknown"]);
    const { error } = await supabaseAdmin
      .from("leads")
      .delete()
      .in("data_provenance", ["mock_legacy", "unknown"]);
    if (error) throw error;
    return { purged: before ?? 0 };
  });
