// Monthly plan credit renewal.
//
// Pricing promises that plan lead credits "reset each billing period" while
// purchased top-ups never expire. Both live in one balance, so at renewal we
// remove only the unused remainder of the previous plan grant and then add the
// new allowance. Top-up credits are never touched.
import { planFor } from "./plans.shared";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

type WorkspaceRow = {
  id: string;
  billing_plan: string | null;
  plan_period_start: string;
  plan_grant_amount: number;
};

export async function renewPlanCredits(now: Date = new Date()) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { applyCreditDelta } = await import("./credits.server");

  const cutoff = new Date(now.getTime() - PERIOD_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, billing_plan, plan_period_start, plan_grant_amount")
    .lte("plan_period_start", cutoff)
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as WorkspaceRow[];
  let renewed = 0;
  let granted = 0;
  let expired = 0;
  const failures: string[] = [];

  for (const ws of rows) {
    try {
      const allowance = planFor(ws.billing_plan).leadCredits;
      const periodStart = ws.plan_period_start;

      // Plan credits consumed during the period that just closed. Paged: the
      // Data API caps a single select at 1000 rows, and an undercounted spend
      // overstates the leftover, which would expire purchased top-up credits
      // that are supposed to never expire.
      let used = 0;
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: spendRows, error: spendErr } = await supabaseAdmin
          .from("credit_ledger")
          .select("delta")
          .eq("workspace_id", ws.id)
          .eq("kind", "scrape")
          .lt("delta", 0)
          .gte("created_at", periodStart)
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (spendErr) throw new Error(spendErr.message);
        const page = (spendRows ?? []) as Array<{ delta: number }>;
        used += page.reduce((sum, r) => sum + Math.abs(r.delta), 0);
        if (page.length < PAGE) break;
      }
      const leftover = Math.max(0, ws.plan_grant_amount - used);

      if (leftover > 0) {
        const { data: bal } = await supabaseAdmin
          .from("credit_balances")
          .select("balance")
          .eq("workspace_id", ws.id)
          .eq("kind", "scrape")
          .maybeSingle();
        const balance = (bal as { balance: number } | null)?.balance ?? 0;
        const drop = Math.min(leftover, balance);
        if (drop > 0) {
          await applyCreditDelta(null, {
            workspaceId: ws.id,
            kind: "scrape",
            delta: -drop,
            reason: "plan_period_expiry",
          });
          expired += drop;
        }
      }

      if (allowance > 0) {
        await applyCreditDelta(null, {
          workspaceId: ws.id,
          kind: "scrape",
          delta: allowance,
          reason: "plan_renewal",
        });
        granted += allowance;
      }

      // Roll the period forward far enough to cover any missed ticks.
      let next = new Date(periodStart).getTime();
      while (next <= now.getTime() - PERIOD_MS) next += PERIOD_MS;

      await supabaseAdmin
        .from("workspaces")
        .update({
          plan_period_start: new Date(next).toISOString(),
          plan_grant_amount: allowance,
          free_records_used: 0,
        })
        .eq("id", ws.id);

      if (allowance > 0) {
        const { logActivity } = await import("./activity.server");
        await logActivity(supabaseAdmin as never, ws.id, {
          type: "credits_purchased",
          summary: `${allowance.toLocaleString()} Plan Lead Credits Renewed`,
          detail: "Monthly Allowance Refreshed",
          refType: "credits",
        });
      }
      renewed += 1;
    } catch (err) {
      failures.push(`${ws.id}: ${err instanceof Error ? err.message : "Renewal Failed"}`);
    }
  }

  return { ok: true, examined: rows.length, renewed, granted, expired, failures };
}
