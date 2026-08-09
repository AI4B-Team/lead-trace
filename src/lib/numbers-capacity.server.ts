/**
 * Sending-number allowance. The plan catalog decides how many DIDs a workspace
 * gets for its platform fee; extras are billed monthly, and plans with zero
 * included numbers cannot buy at all (Free has no outbound sending).
 */
import { EXTRA_NUMBER_MONTHLY, planFor, type Plan } from "./plans.shared";

export type NumberCapacity = {
  plan: Plan;
  owned: number;
  included: number;
  /** Numbers beyond the plan allowance, each billed at EXTRA_NUMBER_MONTHLY. */
  extras: number;
  extraMonthly: number;
  canBuy: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function numberCapacity(supabase: any, workspaceId: string): Promise<NumberCapacity> {
  const [{ data: ws }, { count }] = await Promise.all([
    supabase.from("workspaces").select("billing_plan").eq("id", workspaceId).maybeSingle(),
    supabase
      .from("sending_numbers")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "released"),
  ]);
  const plan = planFor((ws as { billing_plan?: string | null } | null)?.billing_plan);
  const owned = count ?? 0;
  const extras = Math.max(0, owned - plan.numbersIncluded);
  return {
    plan,
    owned,
    included: plan.numbersIncluded,
    extras,
    extraMonthly: Number((extras * EXTRA_NUMBER_MONTHLY).toFixed(2)),
    canBuy: plan.numbersIncluded > 0,
  };
}

/** Throws when the plan cannot hold sending numbers at all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertCanBuyNumbers(supabase: any, workspaceId: string): Promise<NumberCapacity> {
  const cap = await numberCapacity(supabase, workspaceId);
  if (!cap.canBuy) {
    throw new Error(
      `The ${cap.plan.name} plan does not include sending numbers. Upgrade to buy a number and start outreach.`,
    );
  }
  return cap;
}
