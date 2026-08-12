// ---------------------------------------------------------------------------
// The recurring-run engine. The RESCAN dropdown on the Lists page writes a
// cadence; this file is the motor that actually re-runs the list on that
// cadence, keeps only net-new records, and then either auto-launches outreach
// or drops a notification in the bell.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { nextRunFrom, normalizeCadence, type Cadence } from "./schedule.shared";
import { normalizeChannel } from "./channels";
import { executePipeline } from "./pipeline.server";
import { planDrops } from "./drops";

type AnyClient = SupabaseClient<Database>;

export type DueList = {
  id: string;
  workspace_id: string;
  source_type: string;
  record_type: string | null;
  params: Record<string, unknown>;
  schedule: string | null;
  custom_interval_minutes: number | null;
  auto_launch: boolean | null;
  channel: string | null;
  name: string | null;
  created_by: string | null;
};

const LIST_COLUMNS =
  "id, workspace_id, source_type, record_type, params, schedule, custom_interval_minutes, auto_launch, channel, name, created_by";

/** Every run id that belongs to this list — the root row plus every child run. */
export async function runIdsForList(supabase: AnyClient, rootId: string): Promise<string[]> {
  const { data } = await supabase.from("jobs").select("id").eq("parent_job_id", rootId);
  return [rootId, ...((data ?? []) as Array<{ id: string }>).map((r) => r.id)];
}

async function notify(
  supabase: AnyClient,
  workspaceId: string,
  input: { kind: string; title: string; body: string; jobId?: string },
) {
  await supabase.from("notifications").insert({
    workspace_id: workspaceId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    job_id: input.jobId ?? null,
  });
}

/**
 * Clone the outreach the list is already wired to, pointed at the new run's
 * records, and put it straight into sending. Prior campaigns keep their own
 * history — a rescan never rewrites what already went out.
 */
async function autoLaunch(
  supabase: AnyClient,
  list: DueList,
  runIds: string[],
  newRunId: string,
  cleanCount: number,
): Promise<string | null> {
  const { data: template } = await supabase
    .from("campaigns")
    .select(
      "id, name, workspace_id, daily_cap, send_window, drop_size, drop_times, duplicate_policy, bot_enabled, regulated_vertical, bot_config, brand_id, tag_id",
    )
    .eq("workspace_id", list.workspace_id)
    .in("list_job_id", runIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!template) return null;

  const { count: priorCampaigns } = await supabase
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", list.workspace_id)
    .in("list_job_id", runIds);

  const { data: campaign } = await supabase
    .from("campaigns")
    .insert({
      workspace_id: list.workspace_id,
      name: `${template.name} · Run ${(priorCampaigns ?? 1) + 1}`,
      list_job_id: newRunId,
      status: "sending",
      daily_cap: template.daily_cap,
      send_window: template.send_window,
      drop_size: template.drop_size,
      drop_times: template.drop_times,
      duplicate_policy: template.duplicate_policy,
      bot_enabled: template.bot_enabled,
      regulated_vertical: template.regulated_vertical,
      bot_config: template.bot_config,
      brand_id: template.brand_id,
      tag_id: template.tag_id,
    })
    .select("id")
    .maybeSingle();
  if (!campaign?.id) return null;

  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("step_order, delay_minutes, message_variants, active")
    .eq("campaign_id", template.id)
    .order("step_order", { ascending: true });
  if (steps?.length) {
    await supabase.from("campaign_steps").insert(
      steps.map((s) => ({
        campaign_id: campaign.id,
        step_order: s.step_order,
        delay_minutes: s.delay_minutes,
        message_variants: s.message_variants,
        active: s.active,
      })),
    );
  }

  const drops = planDrops(
    cleanCount,
    template.drop_size ?? 500,
    template.drop_times ?? undefined,
    new Date(),
    true,
  );
  if (drops.length) {
    await supabase.from("campaign_drops").insert(
      drops.map((d) => ({
        workspace_id: list.workspace_id,
        campaign_id: campaign.id,
        drop_index: d.drop_index,
        scheduled_at: d.scheduled_at,
        size: d.size,
      })),
    );
  }
  return campaign.id as string;
}

export type RunOutcome = {
  listId: string;
  runId: string | null;
  netNew: number;
  clean: number;
  campaignId: string | null;
  error?: string;
};

/** Execute one due list: clone a run row, pipeline it net-new, then act. */
export async function runListNow(
  supabase: AnyClient,
  list: DueList,
  opts: { manual?: boolean } = {},
): Promise<RunOutcome> {
  const cadence = normalizeCadence(list.schedule);
  const channel = normalizeChannel(list.channel);
  const priorRunIds = await runIdsForList(supabase, list.id);
  const now = new Date();

  const { data: run, error: runErr } = await supabase
    .from("jobs")
    .insert({
      workspace_id: list.workspace_id,
      source_type: list.source_type,
      record_type: list.record_type ?? "business",
      params: list.params as never,
      status: "queued",
      schedule: "one_time",
      parent_job_id: list.id,
      channel,
      created_by: list.created_by,
      name: list.name,
    })
    .select("id")
    .maybeSingle();

  // Always advance the clock, even on failure, so one bad source can't turn
  // into a retry storm every time the cron ticks.
  const nextRunAt =
    cadence === "one_time" ? null : nextRunFrom(cadence, list.custom_interval_minutes, now);
  await supabase
    .from("jobs")
    .update({ last_run_at: now.toISOString(), next_run_at: nextRunAt })
    .eq("id", list.id);

  if (runErr || !run?.id) {
    return {
      listId: list.id,
      runId: null,
      netNew: 0,
      clean: 0,
      campaignId: null,
      error: "Could Not Queue Run",
    };
  }

  try {
    const result = await executePipeline(supabase, run.id as string, {
      priorRunJobIds: priorRunIds,
    });
    const netNew = "netNew" in result ? result.netNew : 0;
    const clean = "clean" in result ? result.clean : 0;

    let campaignId: string | null = null;
    const canAutoSend = channel === "sms" && list.auto_launch === true && clean > 0;
    if (canAutoSend) {
      campaignId = await autoLaunch(supabase, list, priorRunIds, run.id as string, clean);
    }

    const label = list.name ?? "Your List";
    if (netNew === 0) {
      await notify(supabase, list.workspace_id, {
        kind: "run_no_new",
        title: `No New Records — ${label}`,
        body: `${opts.manual ? "This run" : "The scheduled rescan"} found nothing that earlier runs had not already delivered. Nothing was charged.`,
        jobId: run.id as string,
      });
    } else if (campaignId) {
      await notify(supabase, list.workspace_id, {
        kind: "run_auto_launched",
        title: `${clean.toLocaleString()} New Leads — Outreach Started`,
        body: `${label} found ${netNew.toLocaleString()} net-new records and started outreach for the ${clean.toLocaleString()} that came back clean.`,
        jobId: run.id as string,
      });
    } else {
      await notify(supabase, list.workspace_id, {
        kind: "run_complete",
        title: `${netNew.toLocaleString()} New Records — ${label}`,
        body:
          channel === "sms"
            ? `${clean.toLocaleString()} are clean and textable. Review them and launch when you're ready.`
            : `${clean.toLocaleString()} are ready to export for your ${channel === "email" ? "email" : "direct mail"} outreach.`,
        jobId: run.id as string,
      });
    }

    return { listId: list.id, runId: run.id as string, netNew, clean, campaignId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Run Failed";
    await supabase
      .from("jobs")
      .update({ status: "failed", error: message })
      .eq("id", run.id as string);
    await notify(supabase, list.workspace_id, {
      kind: "run_failed",
      title: `Run Failed — ${list.name ?? "Your List"}`,
      body: message,
      jobId: run.id as string,
    });
    return {
      listId: list.id,
      runId: run.id as string,
      netNew: 0,
      clean: 0,
      campaignId: null,
      error: message,
    };
  }
}

/**
 * Runs that were killed mid-flight (worker timeout, deploy, crash) never reach
 * executePipeline's catch, so they sit in an in-flight status forever: the UI
 * shows them as still working and the operator gets no Retry. Anything with no
 * progress event for STALL_MINUTES is moved to a real terminal `failed` state
 * with the stage it died in, which is what unlocks Retry.
 */
const IN_FLIGHT_STATUSES = ["queued", "scraping", "enriching", "skiptracing", "scrubbing"];
const STALL_MINUTES = 30;

export async function reclaimStalledRuns(
  supabase: AnyClient,
  opts: { stallMinutes?: number } = {},
): Promise<{ reclaimed: Array<{ jobId: string; stage: string }> }> {
  const cutoff = new Date(Date.now() - (opts.stallMinutes ?? STALL_MINUTES) * 60_000).toISOString();
  const { data: candidates } = await supabase
    .from("jobs")
    .select("id, workspace_id, status, name, created_at")
    .in("status", IN_FLIGHT_STATUSES)
    .lt("created_at", cutoff)
    .limit(100);

  const reclaimed: Array<{ jobId: string; stage: string }> = [];
  for (const job of (candidates ?? []) as Array<{
    id: string;
    workspace_id: string;
    status: string;
    name: string | null;
    created_at: string;
  }>) {
    // A long-running but healthy run keeps emitting progress events; only a run
    // that has gone quiet is treated as dead.
    const { data: lastEvent } = await supabase
      .from("job_events")
      .select("created_at")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastProgress = (lastEvent as { created_at: string } | null)?.created_at ?? job.created_at;
    if (lastProgress > cutoff) continue;

    const message =
      "Run stopped before it finished — the worker was interrupted. Nothing further was charged. Retry to start it again.";
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: message,
        failed_stage: job.status,
        failed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await supabase.from("job_events").insert({
      job_id: job.id,
      workspace_id: job.workspace_id,
      stage: "failed",
      message: `Run failed during ${job.status}: ${message}`,
      count: null,
    });
    await notify(supabase, job.workspace_id, {
      kind: "run_failed",
      title: `Run Interrupted — ${job.name ?? "Your List"}`,
      body: message,
      jobId: job.id,
    });
    reclaimed.push({ jobId: job.id, stage: job.status });
  }
  return { reclaimed };
}

export async function runDueLists(
  supabase: AnyClient,
  opts: { workspaceId?: string; limit?: number } = {},
): Promise<{ ran: RunOutcome[] }> {
  let q = supabase
    .from("jobs")
    .select(LIST_COLUMNS)
    .eq("schedule_active", true)
    .neq("schedule", "one_time")
    .is("parent_job_id", null)
    .not("next_run_at", "is", null)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(opts.limit ?? 25);
  if (opts.workspaceId) q = q.eq("workspace_id", opts.workspaceId);

  const { data: due, error } = await q;
  if (error) throw error;

  const ran: RunOutcome[] = [];
  for (const list of (due ?? []) as unknown as DueList[]) {
    ran.push(await runListNow(supabase, list));
  }
  return { ran };
}

/** Recompute next_run_at when the cadence changes. */
export function scheduleFieldsFor(
  cadence: Cadence,
  customMinutes: number | null,
  from: Date = new Date(),
) {
  return {
    schedule: cadence,
    custom_interval_minutes: cadence === "custom" ? (customMinutes ?? 60) : null,
    schedule_active: cadence !== "one_time",
    next_run_at: cadence === "one_time" ? null : nextRunFrom(cadence, customMinutes, from),
  };
}
