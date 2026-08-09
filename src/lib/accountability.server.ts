/**
 * Server-only accountability primitives. Lives here (not in the .functions
 * file) so any server path that spends credits or moves data can enforce the
 * same rules without going through RPC.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NO_LIMITS, evaluateExport, evaluateSpend, monthStart, type MemberLimits,
} from "./accountability.shared";
import { can, hasTeamControls, roleOf, type TeamAction, type WorkspaceRole } from "./team-roles.shared";

type AnyClient = Pick<SupabaseClient<any, any, any>, "from">;

export type MemberContext = {
  role: WorkspaceRole;
  plan: string;
  /** True when this workspace's plan includes caps/approvals/anomaly alerts. */
  enforced: boolean;
  limits: MemberLimits;
};

export async function memberContext(
  supabase: AnyClient,
  workspaceId: string,
  userId: string,
): Promise<MemberContext> {
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) throw new Error("Forbidden");
  const { data: ws } = await supabase
    .from("workspaces")
    .select("billing_plan")
    .eq("id", workspaceId)
    .maybeSingle();
  const { data: limits } = await supabase
    .from("member_limits")
    .select(
      "monthly_credit_cap, monthly_export_row_cap, approval_threshold_credits, export_approval_threshold_rows",
    )
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return {
    role: roleOf((member as { role: string }).role),
    plan: (ws as { billing_plan?: string } | null)?.billing_plan ?? "starter",
    enforced: hasTeamControls((ws as { billing_plan?: string } | null)?.billing_plan),
    limits: (limits ?? NO_LIMITS) as MemberLimits,
  };
}

/** This member's own spend and export volume in the current calendar month. */
export async function usedThisMonth(supabase: AnyClient, workspaceId: string, userId: string) {
  const since = monthStart().toISOString();
  const [{ data: ledger }, { data: exports }] = await Promise.all([
    supabase
      .from("credit_ledger")
      .select("delta")
      .eq("workspace_id", workspaceId)
      .eq("actor_user_id", userId)
      .lt("delta", 0)
      .gte("created_at", since),
    supabase
      .from("export_events")
      .select("row_count")
      .eq("workspace_id", workspaceId)
      .eq("actor_user_id", userId)
      .gte("created_at", since),
  ]);
  return {
    credits: ((ledger ?? []) as Array<{ delta: number | null }>).reduce(
      (s, r) => s + Math.abs(r.delta ?? 0), 0),
    exportRows: ((exports ?? []) as Array<{ row_count: number | null }>).reduce(
      (s, r) => s + (r.row_count ?? 0), 0),
  };
}

/**
 * Throws when the member may not perform this spend. Used by real spend paths
 * (build a list, launch a campaign) so a client that skips the pre-flight check
 * still can't get past the cap.
 */
export async function assertSpendAllowed(
  supabase: AnyClient,
  workspaceId: string,
  userId: string,
  input: { amount: number; action: TeamAction; summary: string },
): Promise<void> {
  const ctx = await memberContext(supabase, workspaceId, userId);
  if (!can(ctx.role, input.action)) {
    const { denialMessage } = await import("./team-roles.shared");
    throw new Error(denialMessage(ctx.role, input.action));
  }
  const used = await usedThisMonth(supabase, workspaceId, userId);
  const verdict = evaluateSpend({
    amount: input.amount,
    usedThisMonth: used.credits,
    limits: ctx.limits,
    enforced: ctx.enforced,
  });
  if (verdict.outcome === "allow") return;
  if (verdict.outcome === "needs_approval") {
    // Record the request so the admin queue has it, then stop the action.
    await supabase.from("approval_requests").insert({
      workspace_id: workspaceId,
      requested_by: userId,
      kind: "credits",
      amount: input.amount,
      summary: input.summary,
      detail: { action: input.action },
    } as never);
  }
  throw new Error("reason" in verdict ? verdict.reason : "Spend Blocked");
}

export { evaluateExport, evaluateSpend };

/**
 * Role gate for any server path that mutates, spends or exports. Client-side
 * `can()` checks are convenience only — this is the enforcement point.
 */
export async function assertAction(
  supabase: AnyClient,
  workspaceId: string,
  userId: string,
  action: TeamAction,
): Promise<MemberContext> {
  const ctx = await memberContext(supabase, workspaceId, userId);
  if (!can(ctx.role, action)) {
    const { denialMessage } = await import("./team-roles.shared");
    throw new Error(denialMessage(ctx.role, action));
  }
  return ctx;
}

/** Same gate, resolved from a list (job) id. */
export async function assertJobAction(
  supabase: AnyClient,
  jobId: string,
  userId: string,
  action: TeamAction,
): Promise<{ workspaceId: string; ctx: MemberContext }> {
  const { data: job } = await supabase
    .from("jobs")
    .select("workspace_id")
    .eq("id", jobId)
    .maybeSingle();
  const workspaceId = (job as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) throw new Error("List Not Found");
  return { workspaceId, ctx: await assertAction(supabase, workspaceId, userId, action) };
}

/**
 * Generic write gate: any member (owner/admin/member) may proceed, viewers are
 * read-only. Used by everyday workspace writes that aren't a spend or an
 * admin-only action (tags, quick replies, inbox actions, list settings).
 */
export async function assertWriter(
  supabase: AnyClient,
  workspaceId: string,
  userId: string,
  what = "Change This",
): Promise<MemberContext> {
  const ctx = await memberContext(supabase, workspaceId, userId);
  if (roleOf(ctx.role) === "viewer") {
    throw new Error(`Viewers Cannot ${what}. Ask An Admin For Member Access.`);
  }
  return ctx;
}

/** Same write gate, resolved from a row in a workspace-scoped table. */
export async function assertWriterByRow(
  supabase: AnyClient,
  table: string,
  rowId: string,
  userId: string,
  what = "Change This",
): Promise<string> {
  const { data: row } = await supabase
    .from(table)
    .select("workspace_id")
    .eq("id", rowId)
    .maybeSingle();
  const workspaceId = (row as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) throw new Error("Not Found");
  await assertWriter(supabase, workspaceId, userId, what);
  return workspaceId;
}
