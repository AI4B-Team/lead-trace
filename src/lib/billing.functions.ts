import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isWorkspaceMember } from "./access-checks";

export const getBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // The roster is admin-only at the row level, so the seat total is counted
    // with trusted server credentials after confirming the caller's membership.
    if (!(await isWorkspaceMember(supabase, data.workspaceId, context.userId))) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: balances },
      { data: ledger },
      { data: workspace },
      { count: numberCount },
      { count: seatCount },
    ] = await Promise.all([
      supabase.from("credit_balances").select("*").eq("workspace_id", data.workspaceId),
      supabase.from("credit_ledger").select("*").eq("workspace_id", data.workspaceId).order("created_at", { ascending: false }).limit(50),
      supabase
        .from("workspaces")
        .select(
          "id, name, industry, created_at, refund_email_threshold, billing_plan, plan_period_start, plan_grant_amount",
        )
        .eq("id", data.workspaceId)
        .maybeSingle(),
      supabase
        .from("sending_numbers")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
      supabaseAdmin
        .from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
    ]);
    const map: Record<string, number> = { scrape: 0, skip_trace: 0, sms: 0 };
    for (const b of balances ?? []) map[b.kind] = b.balance;
    return {
      balances: map,
      ledger: ledger ?? [],
      workspace,
      numbers: numberCount ?? 0,
      seats: seatCount ?? 0,
    };
  });

// Manual credit grant. Until a payment provider is wired up, this is the only
// way credits enter a workspace, so it is restricted to platform admins —
// customers must never be able to grant themselves unpaid credits. When
// checkout lands, the payment webhook calls applyCreditDelta directly.
export const topUpCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      kind: z.enum(["scrape", "skip_trace", "sms"]),
      amount: z.number().int().min(100).max(1_000_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Checks run as the caller (RLS); the balance write itself is atomic and
    // service-role only, so clients can never set a balance directly.
    const { isSuperAdmin } = await import("./access-checks");
    if (!(await isSuperAdmin(supabase, context.userId))) throw new Error("Forbidden");

    const { applyCreditDelta } = await import("./credits.server");
    const next = await applyCreditDelta(null, {
      workspaceId: data.workspaceId,
      kind: data.kind,
      delta: data.amount,
      reason: "top_up",
      actorUserId: context.userId,
    });
    const { logActivity } = await import("./activity.server");
    const KIND_LABEL: Record<string, string> = {
      scrape: "Scrape",
      skip_trace: "Trace",
      sms: "SMS",
    };
    await logActivity(supabase, data.workspaceId, {
      type: "credits_purchased",
      summary: `${data.amount.toLocaleString()} ${KIND_LABEL[data.kind] ?? data.kind} Credits Purchased`,
      detail: `New Balance ${next.toLocaleString()}`,
      refType: "credits",
    });
    return { balance: next };
  });
/**
 * How large a refund has to be before we also email about it. Small refunds
 * stay in-app so the email channel keeps meaning something.
 */
export const setRefundEmailThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ workspaceId: z.string().uuid(), threshold: z.number().int().min(1).max(1000000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspaces")
      .update({ refund_email_threshold: data.threshold })
      .eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true, threshold: data.threshold };
  });
