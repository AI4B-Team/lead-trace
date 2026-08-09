/**
 * Low-balance alerts. Fires once per kind per 24h so a long run that debits
 * hundreds of times can't spam the bell. Purely advisory — the hard stop is
 * still the overdraft check inside public.apply_credit_delta.
 */

const KIND_LABEL: Record<string, string> = {
  scrape: "Lead",
  skip_trace: "Skip Trace",
  sms: "SMS",
};

/** Fallback floors when a workspace has no monthly grant to measure against. */
const FLOOR: Record<string, number> = { scrape: 500, skip_trace: 100, sms: 250 };

function thresholdFor(kind: string, planGrant: number | null): number {
  const floor = FLOOR[kind] ?? 100;
  if (kind === "scrape" && planGrant && planGrant > 0) {
    return Math.max(floor, Math.round(planGrant * 0.1));
  }
  return floor;
}

export async function maybeNotifyLowBalance(args: {
  workspaceId: string;
  kind: string;
  balance: number;
}): Promise<void> {
  const { workspaceId, kind, balance } = args;
  if (balance < 0) return;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("plan_grant_amount")
      .eq("id", workspaceId)
      .maybeSingle();

    const threshold = thresholdFor(kind, workspace?.plan_grant_amount ?? null);
    if (balance > threshold) return;

    const notifyKind = `credits_low_${kind}`;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("kind", notifyKind)
      .gte("created_at", since);
    if ((count ?? 0) > 0) return;

    const label = KIND_LABEL[kind] ?? kind;
    const empty = balance === 0;
    const title = empty
      ? `${label} Credits Are Empty`
      : `${label} Credits Running Low — ${balance.toLocaleString()} Left`;
    const body = empty
      ? `New runs that need ${label.toLowerCase()} credits will stop until you top up.`
      : `You're below ${threshold.toLocaleString()} ${label.toLowerCase()} credits. Top up to keep runs from stopping mid-list.`;

    await supabaseAdmin.from("notifications").insert({
      workspace_id: workspaceId,
      kind: notifyKind,
      title,
      body,
    });
    await supabaseAdmin.from("activity_events").insert({
      workspace_id: workspaceId,
      type: "credits_low",
      summary: title,
      detail: body,
      ref_type: "credits",
    });
  } catch (err) {
    console.error("[credit-alerts] low-balance notice failed:", err);
  }
}
