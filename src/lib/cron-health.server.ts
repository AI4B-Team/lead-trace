// Heartbeat + outcome tracking for the /api/public/hooks/tick-* schedulers.
//
// Every tick records how it ended, so the platform admin can tell the
// difference between "ran and found nothing to do" and "has not run in days".
// Writes go through the service-role client: cron_locks is operator-only.

export type TickStatus = "ok" | "error" | "skipped";

/** Records the outcome of a tick run. Never throws — bookkeeping must not break a job. */
export async function recordTickResult(
  key: string,
  status: TickStatus,
  detail: string | null,
  durationMs: number,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: prev } = await supabaseAdmin
      .from("cron_locks")
      .select("consecutive_failures")
      .eq("key", key)
      .maybeSingle();
    const failures = (prev as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0;

    await supabaseAdmin.from("cron_locks").upsert(
      {
        key,
        last_status: status,
        last_detail: detail ? detail.slice(0, 500) : null,
        last_finished_at: now,
        last_duration_ms: Math.round(durationMs),
        consecutive_failures: status === "error" ? failures + 1 : 0,
        ...(status === "ok" ? { last_success_at: now } : {}),
      },
      { onConflict: "key" },
    );
  } catch (err) {
    console.error("[cron] recordTickResult failed:", err instanceof Error ? err.message : err);
  }
}

/** How often each scheduled task is expected to run, in minutes. */
export const TICK_SCHEDULE: { key: string; label: string; everyMinutes: number }[] = [
  { key: "tick-campaigns", label: "Campaign Sender", everyMinutes: 1 },
  { key: "tick-sequences", label: "Follow-Up Sequences", everyMinutes: 5 },
  { key: "tick-jobs", label: "Recurring Lists", everyMinutes: 15 },
  { key: "tick-records-requests", label: "Records Requests", everyMinutes: 1440 },
  { key: "tick-webhook-retries", label: "Webhook Retries", everyMinutes: 1 },
  { key: "tick-agents", label: "Background Agents", everyMinutes: 15 },
  { key: "tick-distress-feed", label: "Distress Feed Sweep", everyMinutes: 1440 },
  { key: "tick-realeflow-sourcing", label: "Licensed Data Sourcing", everyMinutes: 30 },
  { key: "tick-registrations", label: "10DLC Status Sync", everyMinutes: 1440 },
  { key: "tick-template-health", label: "Template Health Canary", everyMinutes: 1440 },
  { key: "tick-plan-renewal", label: "Plan Renewals", everyMinutes: 1440 },
  { key: "tick-compliance-digest", label: "Compliance Digest", everyMinutes: 1440 },
];

export type CronHealthRow = {
  key: string;
  label: string;
  everyMinutes: number;
  lastTickAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastDetail: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  /** true when the task has not run within 3x its expected interval. */
  stale: boolean;
  /**
   * true when the task has no heartbeat at all. Usually means the hook is not
   * reachable on the domain the schedule points at (e.g. not published yet),
   * which is a different problem from a task that ran and then went stale.
   */
  neverRan: boolean;
};

export async function readCronHealth(): Promise<CronHealthRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("cron_locks")
    .select(
      "key, last_tick_at, last_finished_at, last_success_at, last_status, last_detail, last_duration_ms, consecutive_failures",
    );
  const byKey = new Map((data ?? []).map((r: any) => [r.key as string, r]));

  return TICK_SCHEDULE.map((s) => {
    const r = byKey.get(s.key);
    const lastTickAt = (r?.last_tick_at as string | null) ?? null;
    const graceMs = s.everyMinutes * 60_000 * 3;
    const stale = !lastTickAt || Date.now() - new Date(lastTickAt).getTime() > graceMs;
    return {
      key: s.key,
      label: s.label,
      everyMinutes: s.everyMinutes,
      lastTickAt,
      lastFinishedAt: (r?.last_finished_at as string | null) ?? null,
      lastSuccessAt: (r?.last_success_at as string | null) ?? null,
      lastStatus: (r?.last_status as string | null) ?? null,
      lastDetail: (r?.last_detail as string | null) ?? null,
      lastDurationMs: (r?.last_duration_ms as number | null) ?? null,
      consecutiveFailures: (r?.consecutive_failures as number | null) ?? 0,
      stale,
      neverRan: !lastTickAt && !r?.last_finished_at,
    };
  });
}