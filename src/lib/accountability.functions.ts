import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  NO_LIMITS,
  detectAnomalies,
  evaluateExport,
  evaluateSpend,
  exportWatermark,
  monthStart,
  watermarkSuffix,
  type ApprovalRow,
  type MemberCostRow,
  type MemberLimits,
} from "./accountability.shared";
import { can, isAdminRole, roleOf, type TeamAction } from "./team-roles.shared";
import { memberContext, usedThisMonth } from "./accountability.server";

/**
 * Internal accountability layer: who spent, who exported, and what they are
 * allowed to do. Every check runs server-side against the caller's real
 * membership row — the client never asserts its own role.
 */

const wsInput = z.object({ workspaceId: z.string().uuid() });

/** What the signed-in member may do here, plus their spend against their caps. */
export const getTeamContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => wsInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await memberContext(context.supabase, data.workspaceId, context.userId);
    const used = await usedThisMonth(context.supabase, data.workspaceId, context.userId);
    const actions: TeamAction[] = [
      "build_list", "export_list", "launch_campaign", "purchase_credits",
      "delete_data", "edit_suppression", "manage_members", "manage_limits",
      "decide_approvals", "view_member_costs",
    ];
    return {
      role: ctx.role,
      isAdmin: isAdminRole(ctx.role),
      plan: ctx.plan,
      teamControls: ctx.enforced,
      limits: ctx.limits,
      used,
      permissions: Object.fromEntries(actions.map((a) => [a, can(ctx.role, a)])) as Record<TeamAction, boolean>,
    };
  });

/** Pre-flight for a credit-spending action: allow / needs approval / blocked. */
export const checkSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    wsInput.extend({
      amount: z.number().int().min(0),
      summary: z.string().min(1).max(200),
      action: z.enum(["build_list", "launch_campaign", "purchase_credits"]).default("build_list"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await memberContext(context.supabase, data.workspaceId, context.userId);
    if (!can(ctx.role, data.action)) {
      return { outcome: "blocked" as const, reason: "Your Role Cannot Perform This Action." };
    }
    const used = await usedThisMonth(context.supabase, data.workspaceId, context.userId);
    const verdict = evaluateSpend({
      amount: data.amount,
      usedThisMonth: used.credits,
      limits: ctx.limits,
      enforced: ctx.enforced,
    });
    if (verdict.outcome === "needs_approval") {
      const { data: req } = await context.supabase
        .from("approval_requests")
        .insert({
          workspace_id: data.workspaceId,
          requested_by: context.userId,
          kind: "credits",
          amount: data.amount,
          summary: data.summary,
          detail: { action: data.action },
        })
        .select("id")
        .single();
      return { ...verdict, requestId: req?.id ?? null };
    }
    return verdict;
  });

/**
 * Records an export and returns its watermark. Called BEFORE the file is
 * generated: a blocked verdict means no file, and the returned watermark is
 * what the file must carry.
 */
export const logExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    wsInput.extend({
      scope: z.string().min(1).max(60),
      refId: z.string().max(120).optional(),
      rowCount: z.number().int().min(0),
      fileType: z.string().min(1).max(40).default("csv"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await memberContext(context.supabase, data.workspaceId, context.userId);
    if (!can(ctx.role, "export_list")) {
      return { allowed: false as const, reason: "Viewers Cannot Export Data. Ask An Admin For Member Access." };
    }
    const used = await usedThisMonth(context.supabase, data.workspaceId, context.userId);
    const verdict = evaluateExport({
      rowCount: data.rowCount,
      rowsThisMonth: used.exportRows,
      limits: ctx.limits,
      enforced: ctx.enforced,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const who = userRes?.user?.email ?? context.userId.slice(0, 8);

    if (verdict.outcome === "blocked") return { allowed: false as const, reason: verdict.reason };
    if (verdict.outcome === "needs_approval") {
      const summary = `Export ${data.rowCount.toLocaleString()} Rows · ${data.scope}`;
      const { data: row } = await context.supabase
        .from("approval_requests")
        .insert({
          workspace_id: data.workspaceId,
          requested_by: context.userId,
          kind: "export",
          amount: data.rowCount,
          summary,
          detail: { scope: data.scope, refId: data.refId ?? null, fileType: data.fileType },
        })
        .select("id")
        .maybeSingle();
      const { announceApprovalRequest } = await import("./accountability.server");
      await announceApprovalRequest(context.supabase, data.workspaceId, {
        kind: "export",
        summary,
        requesterId: context.userId,
        requestId: row?.id ?? null,
      });
      return { allowed: false as const, reason: verdict.reason, pendingApproval: true as const };
    }

    const watermark = exportWatermark(who);
    await context.supabase.from("export_events").insert({
      workspace_id: data.workspaceId,
      actor_user_id: context.userId,
      scope: data.scope,
      ref_id: data.refId ?? null,
      row_count: data.rowCount,
      file_type: data.fileType,
      watermark,
    });
    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, data.workspaceId, {
      type: "list_exported",
      summary: `${data.rowCount.toLocaleString()} Rows Exported · ${data.scope}`,
      detail: `${data.fileType.toUpperCase()} · ${who}`,
      refId: data.refId ?? null,
      refType: "export",
      actorId: context.userId,
    });
    return { allowed: true as const, watermark, suffix: watermarkSuffix(who) };
  });

// --- Admin surfaces --------------------------------------------------------

async function requireAdmin(supabase: any, workspaceId: string, userId: string) {
  const ctx = await memberContext(supabase, workspaceId, userId);
  if (!isAdminRole(ctx.role)) throw new Error("Only Admins Can View Team Accountability.");
  return ctx;
}

/** Per-member cost + data-movement rollup, with anomaly flags. */
export const memberCostReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => wsInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await requireAdmin(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = monthStart();
    const baselineSince = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() - 3, 1));

    const [{ data: members }, { data: ledger }, { data: exports }, { data: activity }, { data: limits }] =
      await Promise.all([
        supabaseAdmin
          .from("workspace_members")
          .select("user_id, role, created_at, last_visit_at")
          .eq("workspace_id", data.workspaceId),
        supabaseAdmin
          .from("credit_ledger")
          .select("actor_user_id, delta, created_at")
          .eq("workspace_id", data.workspaceId)
          .lt("delta", 0)
          .gte("created_at", baselineSince.toISOString()),
        supabaseAdmin
          .from("export_events")
          .select("actor_user_id, row_count, created_at")
          .eq("workspace_id", data.workspaceId)
          .gte("created_at", baselineSince.toISOString()),
        supabaseAdmin
          .from("activity_events")
          .select("actor_id, type, created_at")
          .eq("workspace_id", data.workspaceId)
          .gte("created_at", since.toISOString()),
        supabaseAdmin
          .from("member_limits")
          .select("user_id, monthly_credit_cap, monthly_export_row_cap, approval_threshold_credits, export_approval_threshold_rows")
          .eq("workspace_id", data.workspaceId),
      ]);

    const limitFor = (uid: string) =>
      (limits ?? []).find((l: any) => l.user_id === uid) ?? { ...NO_LIMITS, user_id: uid };
    const inMonth = (iso: string) => new Date(iso) >= since;

    const rows: MemberCostRow[] = [];
    for (const m of members ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      const email = u?.user?.email ?? "";
      const myLedger = (ledger ?? []).filter((r: any) => r.actor_user_id === m.user_id);
      const myExports = (exports ?? []).filter((r: any) => r.actor_user_id === m.user_id);
      const myActivity = (activity ?? []).filter((r: any) => r.actor_id === m.user_id);

      const creditsThisMonth = myLedger.filter((r: any) => inMonth(r.created_at))
        .reduce((s: number, r: any) => s + Math.abs(r.delta ?? 0), 0);
      const priorCredits = myLedger.filter((r: any) => !inMonth(r.created_at))
        .reduce((s: number, r: any) => s + Math.abs(r.delta ?? 0), 0);
      const exportRows = myExports.filter((r: any) => inMonth(r.created_at))
        .reduce((s: number, r: any) => s + (r.row_count ?? 0), 0);
      const priorExportRows = myExports.filter((r: any) => !inMonth(r.created_at))
        .reduce((s: number, r: any) => s + (r.row_count ?? 0), 0);
      const offHoursExportRows = myExports
        .filter((r: any) => inMonth(r.created_at))
        .filter((r: any) => { const h = new Date(r.created_at).getUTCHours(); return h >= 22 || h < 6; })
        .reduce((s: number, r: any) => s + (r.row_count ?? 0), 0);

      rows.push({
        user_id: m.user_id,
        email,
        role: roleOf(m.role),
        last_visit_at: m.last_visit_at ?? null,
        credits_this_month: creditsThisMonth,
        credits_prior_avg: Math.round(priorCredits / 3),
        export_rows_this_month: exportRows,
        export_count_this_month: myExports.filter((r: any) => inMonth(r.created_at)).length,
        lists_built: myActivity.filter((a: any) => a.type === "list_built").length,
        campaigns_launched: myActivity.filter((a: any) => a.type === "campaign_launched").length,
        limits: limitFor(m.user_id),
        anomalies: detectAnomalies({
          creditsThisMonth,
          creditsBaseline: priorCredits / 3,
          exportRowsThisMonth: exportRows,
          exportRowsBaseline: priorExportRows / 3,
          monthsOfHistory: priorCredits > 0 || priorExportRows > 0 ? 1 : 0,
          offHoursExportRows,
        }),
      });
    }
    rows.sort((a, b) => b.credits_this_month - a.credits_this_month);
    return { rows, teamControls: ctx.enforced, plan: ctx.plan };
  });

/** Attributed audit log: credits, exports and workspace actions, by actor. */
export const attributedAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    wsInput.extend({
      actorUserId: z.string().uuid().optional(),
      kind: z.enum(["all", "credits", "exports", "actions"]).default("all"),
      limit: z.number().int().min(1).max(200).default(80),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const emails = new Map<string, string>();
    const emailFor = async (uid: string | null) => {
      if (!uid) return "System";
      if (emails.has(uid)) return emails.get(uid)!;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
      const email = u?.user?.email ?? uid.slice(0, 8);
      emails.set(uid, email);
      return email;
    };

    const entries: Array<{
      id: string; at: string; actor_user_id: string | null; actor: string;
      kind: "credits" | "exports" | "actions"; summary: string; detail: string | null; amount: number | null;
    }> = [];

    if (data.kind === "all" || data.kind === "credits") {
      let q = supabaseAdmin
        .from("credit_ledger")
        .select("id, actor_user_id, kind, delta, reason, created_at")
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.actorUserId) q = q.eq("actor_user_id", data.actorUserId);
      const { data: rows } = await q;
      for (const r of rows ?? []) {
        entries.push({
          id: `credit-${r.id}`,
          at: r.created_at,
          actor_user_id: r.actor_user_id,
          actor: await emailFor(r.actor_user_id),
          kind: "credits",
          summary: `${(r.delta ?? 0) < 0 ? "Spent" : "Added"} ${Math.abs(r.delta ?? 0).toLocaleString()} ${r.kind} Credits`,
          detail: r.reason ?? null,
          amount: r.delta ?? 0,
        });
      }
    }
    if (data.kind === "all" || data.kind === "exports") {
      let q = supabaseAdmin
        .from("export_events")
        .select("id, actor_user_id, scope, row_count, file_type, watermark, created_at")
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.actorUserId) q = q.eq("actor_user_id", data.actorUserId);
      const { data: rows } = await q;
      for (const r of rows ?? []) {
        entries.push({
          id: `export-${r.id}`,
          at: r.created_at,
          actor_user_id: r.actor_user_id,
          actor: await emailFor(r.actor_user_id),
          kind: "exports",
          summary: `Exported ${(r.row_count ?? 0).toLocaleString()} Rows · ${r.scope}`,
          detail: `${(r.file_type ?? "csv").toUpperCase()} · ${r.watermark ?? ""}`,
          amount: r.row_count ?? 0,
        });
      }
    }
    if (data.kind === "all" || data.kind === "actions") {
      let q = supabaseAdmin
        .from("activity_events")
        .select("id, actor_id, type, summary, detail, created_at")
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.actorUserId) q = q.eq("actor_id", data.actorUserId);
      const { data: rows } = await q;
      for (const r of rows ?? []) {
        entries.push({
          id: `activity-${r.id}`,
          at: r.created_at,
          actor_user_id: r.actor_id,
          actor: await emailFor(r.actor_id),
          kind: "actions",
          summary: r.summary,
          detail: r.detail ?? null,
          amount: null,
        });
      }
    }
    entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { entries: entries.slice(0, data.limit) };
  });

/** Admin sets a member's caps and approval thresholds. */
export const setMemberLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    wsInput.extend({
      userId: z.string().uuid(),
      monthlyCreditCap: z.number().int().min(0).max(10_000_000).nullable(),
      monthlyExportRowCap: z.number().int().min(0).max(100_000_000).nullable(),
      approvalThresholdCredits: z.number().int().min(0).max(10_000_000).nullable(),
      exportApprovalThresholdRows: z.number().int().min(0).max(100_000_000).nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await requireAdmin(context.supabase, data.workspaceId, context.userId);
    if (!ctx.enforced) throw new Error("Per-Member Caps Are A Team Plan Capability.");
    const { error } = await context.supabase.from("member_limits").upsert(
      {
        workspace_id: data.workspaceId,
        user_id: data.userId,
        monthly_credit_cap: data.monthlyCreditCap,
        monthly_export_row_cap: data.monthlyExportRowCap,
        approval_threshold_credits: data.approvalThresholdCredits,
        export_approval_threshold_rows: data.exportApprovalThresholdRows,
        updated_by: context.userId,
      },
      { onConflict: "workspace_id,user_id" },
    );
    if (error) throw error;
    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, data.workspaceId, {
      type: "member_limits_set",
      summary: "Member Limits Updated",
      detail: `Credit Cap ${data.monthlyCreditCap ?? "None"} · Export Rows ${data.monthlyExportRowCap ?? "None"}`,
      refId: data.userId,
      refType: "member",
      actorId: context.userId,
    });
    return { ok: true };
  });

/** Admin changes a member's role. */
export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    wsInput.extend({
      userId: z.string().uuid(),
      role: z.enum(["admin", "member", "viewer"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("Not A Member Of This Workspace");
    if (target.role === "owner") throw new Error("The Owner's Role Cannot Be Changed");
    const { error } = await supabaseAdmin
      .from("workspace_members")
      .update({ role: data.role })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);
    if (error) throw error;
    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, data.workspaceId, {
      type: "member_role_changed",
      summary: `Role Changed To ${data.role}`,
      refId: data.userId,
      refType: "member",
      actorId: context.userId,
    });
    return { ok: true };
  });

/** Pending approvals for the admin queue. */
export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => wsInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await memberContext(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("approval_requests")
      .select("id, requested_by, kind, amount, summary, status, created_at, decided_at, decision_note")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!isAdminRole(ctx.role)) q = q.eq("requested_by", context.userId);
    const { data: rows } = await q;
    const out: ApprovalRow[] = [];
    for (const r of rows ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.requested_by);
      out.push({ ...r, requester: u?.user?.email ?? r.requested_by.slice(0, 8) } as ApprovalRow);
    }
    return { requests: out, isAdmin: isAdminRole(ctx.role) };
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    wsInput.extend({
      requestId: z.string().uuid(),
      decision: z.enum(["approved", "declined"]),
      note: z.string().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.workspaceId, context.userId);
    const { data: updated, error } = await context.supabase
      .from("approval_requests")
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        decision_note: data.note ?? null,
      })
      .eq("id", data.requestId)
      .eq("workspace_id", data.workspaceId)
      .select("summary")
      .maybeSingle();
    if (error) throw error;
    const { announceApprovalDecision } = await import("./accountability.server");
    await announceApprovalDecision(context.supabase, data.workspaceId, {
      decision: data.decision,
      summary: updated?.summary ?? "Request",
      deciderId: context.userId,
      requestId: data.requestId,
      note: data.note ?? null,
    });
    return { ok: true };
  });

/**
 * Revoke a seat: membership goes first (which cuts off all workspace data
 * server-side immediately), then the session is invalidated so an open tab
 * cannot keep spending or exporting.
 */
export const revokeSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => wsInput.extend({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.workspaceId, context.userId);
    if (data.userId === context.userId) throw new Error("You Cannot Revoke Your Own Seat");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("Not A Member Of This Workspace");
    if (target.role === "owner") throw new Error("The Owner's Seat Cannot Be Revoked");

    await supabaseAdmin
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", data.userId);
    await supabaseAdmin.from("seat_revocations").insert({
      workspace_id: data.workspaceId,
      user_id: data.userId,
      revoked_by: context.userId,
    });
    // Best-effort hard sign-out; membership deletion is the real gate.
    try {
      await (supabaseAdmin.auth.admin as any).signOut?.(data.userId, "global");
    } catch { /* provider may not expose per-user sign-out */ }

    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, data.workspaceId, {
      type: "member_removed",
      summary: "Seat Revoked",
      detail: "Membership Removed And Session Invalidated",
      refId: data.userId,
      refType: "member",
      actorId: context.userId,
    });
    return { ok: true };
  });

/** Has this signed-in user had a seat revoked since they loaded the app? */
export const checkSeatRevoked = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("seat_revocations")
      .select("workspace_id, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { revokedAt: data?.created_at ?? null, workspaceId: data?.workspace_id ?? null };
  });
