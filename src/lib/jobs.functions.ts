import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RESCRUB_DAYS, SCRUB_STALE_MESSAGE, isScrubStale, scrubAgeDays } from "@/lib/compliance-rules";
import { assignJobNames, cadenceBadge, jobSearchKey } from "@/lib/job-naming";
import { pgIlikePattern } from "@/lib/pg-filter";
import { TRUSTED_PROVENANCE, UNTRUSTED_LIST_MESSAGE } from "@/lib/provenance.shared";

// List every job for a workspace with lead-bucket counts for the Lists page.
export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ workspaceId: z.string().uuid(), timeZone: z.string().max(60).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        "id, source_type, record_type, status, rows_in, rows_deduped, rows_enriched, rows_skiptraced, params, created_at, schedule, next_run_at, last_run_at, custom_interval_minutes, schedule_active, auto_launch, channel, net_new_count, error, failed_stage, failed_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (jobs ?? []).map((j) => j.id);
    const counts = new Map<string, { clean: number; dnc: number; litigator: number }>();
    for (const id of ids) counts.set(id, { clean: 0, dnc: 0, litigator: 0 });
    // Lists that have kicked off at least one SMS campaign (§ unused inventory).
    const launched = new Set<string>();
    // Latest progress event per job — powers the stuck-job watchdog (§23).
    const lastEventAt = new Map<string, string>();
    // Records added since the previous recurring run (§ recurring search diffing).
    const newSince = new Map<string, number>();
    if (ids.length) {
      const { data: linkedCampaigns } = await supabase
        .from("campaigns")
        .select("list_job_id")
        .in("list_job_id", ids);
      for (const c of linkedCampaigns ?? []) if (c.list_job_id) launched.add(c.list_job_id);
      const { data: events } = await supabase
        .from("job_events")
        .select("job_id, created_at")
        .in("job_id", ids)
        .order("created_at", { ascending: false });
      for (const e of events ?? []) {
        if (e.job_id && !lastEventAt.has(e.job_id)) lastEventAt.set(e.job_id, e.created_at);
      }
      const { data: rows } = await supabase
        .from("leads")
        .select("job_id, scrub_status, created_at")
        .in("job_id", ids);
      const lastRunByJob = new Map<string, string | null>(
        (jobs ?? []).map((j) => [j.id, j.last_run_at ?? null]),
      );
      for (const r of rows ?? []) {
        const c = counts.get(r.job_id!);
        if (!c) continue;
        if (r.scrub_status === "clean") c.clean += 1;
        else if (r.scrub_status === "dnc") c.dnc += 1;
        else if (r.scrub_status === "litigator") c.litigator += 1;
        const lastRun = lastRunByJob.get(r.job_id!);
        if (lastRun && r.created_at && new Date(r.created_at) > new Date(lastRun)) {
          newSince.set(r.job_id!, (newSince.get(r.job_id!) ?? 0) + 1);
        }
      }
    }

    const nameMap = assignJobNames(
      (jobs ?? []).map((j) => ({
        id: j.id,
        source_type: j.source_type,
        record_type: j.record_type,
        params: (j.params ?? {}) as Record<string, unknown>,
        created_at: j.created_at,
      })),
      data.timeZone,
    );

    return {
      jobs: (jobs ?? []).map((j) => {
        const names = nameMap;
        const p = (j.params ?? {}) as Record<string, unknown>;
        const flat = (v: unknown): string[] =>
          Array.isArray(v)
            ? v.flatMap(flat)
            : typeof v === "string" && v.trim()
              ? [v.trim()]
              : [];
        // Every populated spec field the Lists search should match against.
        const specTerms = [
          p["niches"],
          p["keyword"],
          p["recordType"],
          p["record_type"],
          j.record_type,
          p["state"],
          p["states"],
          p["counties"],
          p["city"],
          p["country"],
          p["targetUrl"],
          p["filters"],
          p["contactTarget"],
          p["industry"],
        ].flatMap(flat);
        return {
          id: j.id,
          name: names.get(j.id)?.name ?? `${j.source_type} · ${j.id.slice(0, 8)}`,
          template_id: typeof p["templateId"] === "string" ? (p["templateId"] as string) : null,
          spec_terms: specTerms,
          run_index: names.get(j.id)?.runIndex ?? 1,
          run_total: names.get(j.id)?.runTotal ?? 1,
          group_key: jobSearchKey({
            id: j.id,
            source_type: j.source_type,
            record_type: j.record_type,
            params: (j.params ?? {}) as Record<string, unknown>,
            created_at: j.created_at,
          }),
          cadence_badge: cadenceBadge(j.schedule),
          source_type: j.source_type,
          status: j.status,
          error: j.error ?? null,
          failed_stage: j.failed_stage ?? null,
          rows_in: j.rows_in ?? 0,
          rows_deduped: j.rows_deduped ?? 0,
          rows_enriched: j.rows_enriched ?? 0,
          rows_skiptraced: j.rows_skiptraced ?? 0,
          created_at: j.created_at,
          last_event_at: lastEventAt.get(j.id) ?? null,
          record_type: j.record_type ?? "business",
          schedule: j.schedule ?? "one_time",
          custom_interval_minutes: j.custom_interval_minutes ?? null,
          schedule_active: j.schedule_active !== false,
          auto_launch: j.auto_launch === true,
          channel: j.channel ?? "sms",
          net_new_count: j.net_new_count ?? null,
          next_run_at: j.next_run_at,
          last_run_at: j.last_run_at,
          new_since_last_run: newSince.get(j.id) ?? 0,
          launched: launched.has(j.id),
          counts: counts.get(j.id) ?? { clean: 0, dnc: 0, litigator: 0 },
        };
      }),
    };
  });

// Paginated lead browser for the Job Detail drawer.
// Live narration feed for the job progress screen.
export const listJobEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: events, error } = await context.supabase
      .from("job_events")
      .select("id, stage, message, count, created_at")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    // Keep the newest 200 events, returned oldest-first so the narration feed
    // reads top-to-bottom and the stuck-job watchdog sees the real latest event
    // even on long runs that exceed the window.
    return { events: (events ?? []).slice().reverse() };
  });

export const listJobLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      jobId: z.string().uuid(),
      // "property" = deliverable property leads with no phone yet. Their stored
      // scrub verdict stays "unknown" (there is no phone to scrub) — this
      // bucket only changes what the browser SHOWS.
      bucket: z.enum(["clean", "dnc", "litigator", "property", "all"]).default("clean"),
      search: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("leads")
      .select("id, full_name, business_name, phone, phone_type, email, city, state, address, zip, source_meta, scrub_status")
      .eq("job_id", data.jobId)
      .order("full_name", { ascending: true })
      .limit(data.limit);
    if (data.bucket === "property") q = q.is("phone", null);
    else if (data.bucket !== "all") q = q.eq("scrub_status", data.bucket);
    if (data.search?.trim()) {
      // Quote the pattern: a comma or parenthesis in the search text would
      // otherwise be read as filter syntax and fail the whole query.
      const s = pgIlikePattern(data.search.trim());
      q = q.or(`full_name.ilike.${s},business_name.ilike.${s},phone.ilike.${s},email.ilike.${s},city.ilike.${s}`);
    }
    const { data: leads, error } = await q;
    if (error) throw error;
    return { leads: leads ?? [] };
  });

// Load a job with its leads counts, scrub run, and computed quality score.
export const getJobReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ jobId: z.string().uuid(), timeZone: z.string().max(60).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error || !job) throw new Error("List Not Found");

    const { data: scrub } = await supabase
      .from("scrub_runs")
      .select("*")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: total } = await supabase
      .from("leads").select("id", { count: "exact", head: true }).eq("job_id", data.jobId);
    const { count: clean } = await supabase
      .from("leads").select("id", { count: "exact", head: true }).eq("job_id", data.jobId).eq("scrub_status", "clean");
    const { count: dnc } = await supabase
      .from("leads").select("id", { count: "exact", head: true }).eq("job_id", data.jobId).eq("scrub_status", "dnc");
    const { count: litigator } = await supabase
      .from("leads").select("id", { count: "exact", head: true }).eq("job_id", data.jobId).eq("scrub_status", "litigator");
    const { count: mobile } = await supabase
      .from("leads").select("id", { count: "exact", head: true }).eq("job_id", data.jobId).eq("phone_type", "mobile");

    // Credits burned by this job (ledger debits are negative deltas).
    const { data: ledger } = await supabase
      .from("credit_ledger")
      .select("delta, reason")
      .eq("job_id", data.jobId);
    const creditsUsed = (ledger ?? []).reduce(
      (sum, row) => sum + Math.max(0, -(row.delta ?? 0)),
      0,
    );

    // Refunds this run made, split by class. Source failures are announced
    // separately; per-record skips only ever show up as this roll-up line.
    const { refundClassOf } = await import("@/lib/refunds.shared");
    const refunds = { source: 0, skipped: 0 };
    for (const row of (ledger ?? []) as Array<{ delta: number | null; reason: string | null }>) {
      const amount = Math.max(0, row.delta ?? 0);
      if (amount <= 0) continue;
      const cls = refundClassOf(row.reason);
      if (cls === "source") refunds.source += amount;
      else if (cls === "skip") refunds.skipped += amount;
    }

    // Records the source couldn't check — normal on most runs, never charged.
    // The pipeline logs these as a single `skipped` event per run.
    const { data: skipEvents } = await supabase
      .from("job_events")
      .select("count")
      .eq("job_id", data.jobId)
      .eq("stage", "skipped");
    const skippedRecords = (skipEvents ?? []).reduce(
      (sum, e) => sum + ((e as { count: number | null }).count ?? 0),
      0,
    );

    const t = total ?? 0;

    // Real message templates for this list, so the Launch Estimate can bill
    // actual SMS segments instead of assuming one segment per message.
    const { data: jobCampaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("list_job_id", data.jobId);
    let messageTemplates: string[] = [];
    if (jobCampaigns?.length) {
      const { data: steps } = await supabase
        .from("campaign_steps")
        .select("step_order, message_variants, campaign_id, active")
        .in("campaign_id", jobCampaigns.map((c) => c.id))
        .order("step_order", { ascending: true });
      messageTemplates = (steps ?? [])
        .filter((s) => s.active !== false)
        .map((s) => (s.message_variants ?? []).find((v) => typeof v === "string" && v.trim()) ?? "")
        .filter((v) => v.length > 0);
    }

    const cleanRate = t ? (clean ?? 0) / t : 0;
    const mobileRate = t ? (mobile ?? 0) / t : 0;
    const reachability = t ? Math.min(1, ((clean ?? 0) + (mobile ?? 0)) / (2 * t)) : 0;
    const quality = Math.round((cleanRate * 0.5 + mobileRate * 0.3 + reachability * 0.2) * 100);

    return {
      job,
      displayName:
        (await (async () => {
          const { data: siblings } = await supabase
            .from("jobs")
            .select("id, source_type, record_type, params, created_at")
            .eq("workspace_id", job.workspace_id);
          const map = assignJobNames(
            (siblings ?? []).map((s) => ({
              id: s.id,
              source_type: s.source_type,
              record_type: s.record_type,
              params: (s.params ?? {}) as Record<string, unknown>,
              created_at: s.created_at,
            })),
            data.timeZone,
          );
          return map.get(job.id)?.name ?? null;
        })()) ?? null,
      cadenceBadge: cadenceBadge(job.schedule),
      scrub,
      counts: { total: t, clean: clean ?? 0, dnc: dnc ?? 0, litigator: litigator ?? 0, mobile: mobile ?? 0 },
      quality,
      creditsUsed,
      refunds,
      skippedRecords,
      messageTemplates,
      scrubFreshness: {
        scrubbedAt: scrub?.created_at ?? null,
        ageDays: scrubAgeDays(scrub?.created_at ?? null),
        stale: isScrubStale(scrub?.created_at ?? null),
        rescrubDays: RESCRUB_DAYS,
      },
    };
  });

// Pause a running job (§9.5) — the orchestrator stops picking it up.
export const pauseJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertJobAction } = await import("./accountability.server");
    await assertJobAction(context.supabase, data.jobId, context.userId, "build_list");
    const { error } = await context.supabase
      .from("jobs")
      .update({ status: "paused" })
      .eq("id", data.jobId);
    if (error) throw error;
    await context.supabase.from("job_events").insert({
      job_id: data.jobId,
      stage: "paused",
      message: "Run Paused. Nothing Is Discarded — Resume Any Time.",
    } as never);
    return { ok: true };
  });

// Resume a paused or failed job by re-queuing it for the orchestrator.
export const resumeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertJobAction } = await import("./accountability.server");
    await assertJobAction(context.supabase, data.jobId, context.userId, "build_list");
    const { error } = await context.supabase
      .from("jobs")
      .update({ status: "queued", error: null, failed_stage: null, failed_at: null })
      .eq("id", data.jobId);
    if (error) throw error;
    await context.supabase.from("job_events").insert({
      job_id: data.jobId,
      stage: "queued",
      message: "Run Resumed From The Last Completed Stage.",
    } as never);
    return { ok: true };
  });

// Download leads by bucket. Returns rows -- caller builds CSV in the browser.
export const getLeadsByBucket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      jobId: z.string().uuid(),
      bucket: z.enum(["clean", "dnc", "litigator"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertJobAction } = await import("./accountability.server");
    await assertJobAction(context.supabase, data.jobId, context.userId, "export_list");
    // The Data API caps ONE select at 1000 rows, so asking for 50k silently
    // truncated every bucket above that — page through the whole bucket.
    const page = (from: number, to: number) =>
      context.supabase
        .from("leads")
        .select("full_name, business_name, phone, phone_type, email, address, city, state, zip, scrub_status")
        .eq("job_id", data.jobId)
        .eq("scrub_status", data.bucket)
        // Unverified legacy records are never exportable.
        .in("data_provenance", TRUSTED_PROVENANCE)
        .order("phone", { ascending: true })
        .range(from, to);

    const MAX = 50_000;
    const PAGE = 1000;
    type Row = NonNullable<Awaited<ReturnType<typeof page>>["data"]>[number];
    const rows: Row[] = [];
    for (let from = 0; from < MAX; from += PAGE) {
      const to = Math.min(from + PAGE, MAX) - 1;
      const { data: chunk, error } = await page(from, to);
      if (error) throw error;
      rows.push(...(chunk ?? []));
      if (!chunk || chunk.length < to - from + 1) break;
    }
    return { rows };
  });

// Server-enforced compliance gate: creates a campaign only if the source job
// is `ready` and only clean leads are attached. DNC/Litigator are download-only.
export const launchCampaignFromJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      jobId: z.string().uuid(),
      name: z.string().min(1).max(120),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error: jerr } = await supabase
      .from("jobs")
      .select("id, workspace_id, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jerr || !job) throw new Error("List Not Found");
    {
      const { assertAction } = await import("./accountability.server");
      await assertAction(supabase, job.workspace_id, context.userId, "launch_campaign");
    }
    if (job.status !== "ready") throw new Error("List Is Not Ready. Scrub Must Complete First.");

    // §6: a list older than 30 days must be re-scrubbed before it can send.
    const { data: lastScrub } = await supabase
      .from("scrub_runs")
      .select("created_at")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isScrubStale(lastScrub?.created_at)) throw new Error(SCRUB_STALE_MESSAGE);

    const { count: cleanCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("job_id", data.jobId)
      .eq("scrub_status", "clean")
      .in("data_provenance", TRUSTED_PROVENANCE);
    if (!cleanCount) {
      const { count: anyClean } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId)
        .eq("scrub_status", "clean");
      throw new Error(anyClean ? UNTRUSTED_LIST_MESSAGE : "No Clean Leads Available.");
    }

    const { data: campaign, error: cerr } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: job.workspace_id,
        list_job_id: data.jobId,
        name: data.name,
        status: "draft",
        daily_cap: 500,
        send_window: { quiet_start: "21:00", quiet_end: "09:00" } as never,
      })
      .select("id")
      .single();
    if (cerr || !campaign) throw cerr ?? new Error("Campaign create failed");

    // Default 4-touch drip with a single starter variant per step.
    const steps = [
      { step_order: 1, delay_minutes: 0, message_variants: ["Hi {{first_name}} — quick question about your {{niche}} in {{city}}?"] },
      { step_order: 2, delay_minutes: 2, message_variants: ["Following up — got a minute today?"] },
      { step_order: 3, delay_minutes: 180, message_variants: ["Still looking for {{niche}} help in {{city}}? Happy to send info."] },
      { step_order: 4, delay_minutes: 2880, message_variants: ["Last check-in — want me to close this out?"] },
    ];
    await supabase.from("campaign_steps").insert(
      steps.map((s) => ({ campaign_id: campaign.id, ...s })),
    );

    {
      const { logActivity } = await import("./activity.server");
      await logActivity(supabase, job.workspace_id, {
        type: "campaign_created",
        summary: `Campaign Created — ${data.name}`,
        detail: `${(cleanCount ?? 0).toLocaleString()} Clean Leads Attached`,
        refId: campaign.id,
        refType: "campaign",
        actorId: context.userId,
      });
    }
    return { campaignId: campaign.id };
  });
// ---------------------------------------------------------------------------
// Recurring-run controls. The RESCAN dropdown, the auto-launch toggle, the
// channel override, and the "Run Now" button all land here.
// ---------------------------------------------------------------------------

const CADENCE_ENUM = z.enum(["one_time", "every_2h", "every_12h", "daily", "weekly", "custom"]);

export const setListSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        jobId: z.string().uuid(),
        cadence: CADENCE_ENUM,
        customMinutes: z.number().int().min(15).max(43200).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { scheduleFieldsFor } = await import("./recurring.server");
    const { data: job } = await context.supabase
      .from("jobs")
      .select("source_type, workspace_id, name, parent_job_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job?.workspace_id) throw new Error("List Not Found");
    // A cadence always belongs to the list, never to one of its runs. Editing
    // it from a run row must retarget the parent, or the cron would skip it
    // forever (runDueLists only walks parent rows).
    const targetId = (job.parent_job_id as string | null) ?? data.jobId;
    {
      const { assertAction } = await import("./accountability.server");
      await assertAction(context.supabase, job.workspace_id, context.userId, "build_list");
    }
    if (job?.source_type === "upload" && data.cadence !== "one_time") {
      throw new Error("Uploaded Lists Are One-Time Only — There Is Nothing To Re-Scrape.");
    }
    const fields = scheduleFieldsFor(data.cadence, data.customMinutes);
    const { error } = await context.supabase.from("jobs").update(fields).eq("id", targetId);
    if (error) throw error;
    if (job?.workspace_id) {
      const { logActivity } = await import("./activity.server");
      const CADENCE_LABEL: Record<string, string> = {
        one_time: "One-Time Only",
        every_2h: "Every 2 Hours",
        every_12h: "Every 12 Hours",
        daily: "Daily",
        weekly: "Weekly",
        custom: "Custom Interval",
      };
      await logActivity(context.supabase, job.workspace_id, {
        type: "cadence_set",
        summary: `Schedule Set To ${CADENCE_LABEL[data.cadence] ?? data.cadence}`,
        detail: job.name ?? null,
        refId: targetId,
        refType: "list",
        actorId: context.userId,
      });
    }
    return fields;
  });

export const setListScheduleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ jobId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertJobAction } = await import("./accountability.server");
    await assertJobAction(context.supabase, data.jobId, context.userId, "build_list");
    const { data: job } = await context.supabase
      .from("jobs")
      .select("schedule, custom_interval_minutes, parent_job_id")
      .eq("id", data.jobId)
      .maybeSingle();
    // Same rule as the cadence setter: pausing/resuming applies to the list.
    const targetId = (job?.parent_job_id as string | null) ?? data.jobId;
    // Cadence lives on the list row, so read it from the target too.
    let sched = { schedule: job?.schedule ?? null, custom_interval_minutes: job?.custom_interval_minutes ?? null };
    if (targetId !== data.jobId) {
      const { data: parent } = await context.supabase
        .from("jobs")
        .select("schedule, custom_interval_minutes")
        .eq("id", targetId)
        .maybeSingle();
      if (parent) sched = parent;
    }
    const { nextRunFrom, normalizeCadence } = await import("./schedule.shared");
    const cadence = normalizeCadence(sched.schedule ?? null);
    const next =
      data.active && cadence !== "one_time"
        ? nextRunFrom(cadence, sched.custom_interval_minutes ?? null)
        : null;
    const { error } = await context.supabase
      .from("jobs")
      .update({ schedule_active: data.active, next_run_at: next })
      .eq("id", targetId);
    if (error) throw error;
    return { active: data.active, next_run_at: next };
  });

export const setListAutoLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ jobId: z.string().uuid(), autoLaunch: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertJobAction } = await import("./accountability.server");
    await assertJobAction(context.supabase, data.jobId, context.userId, "launch_campaign");
    const { error } = await context.supabase
      .from("jobs")
      .update({ auto_launch: data.autoLaunch })
      .eq("id", data.jobId);
    if (error) throw error;
    return { ok: true, autoLaunch: data.autoLaunch };
  });

export const setListChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ jobId: z.string().uuid(), channel: z.enum(["sms", "email", "direct_mail"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Only SMS lists can auto-send, so switching away turns auto-launch off.
    const { assertJobAction } = await import("./accountability.server");
    await assertJobAction(context.supabase, data.jobId, context.userId, "build_list");
    const { error } = await context.supabase
      .from("jobs")
      .update({ channel: data.channel, ...(data.channel === "sms" ? {} : { auto_launch: false }) })
      .eq("id", data.jobId);
    if (error) throw error;
    return { ok: true, channel: data.channel };
  });

/** Run a saved list right now — same engine the cron uses, net-new only. */
export const runListNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: list, error } = await context.supabase
      .from("jobs")
      .select(
        "id, workspace_id, source_type, record_type, params, schedule, custom_interval_minutes, auto_launch, channel, name, created_by",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw error;
    if (!list) throw new Error("List Not Found");
    {
      const { assertAction } = await import("./accountability.server");
      await assertAction(context.supabase, list.workspace_id, context.userId, "build_list");
    }
    const { runListNow: run } = await import("./recurring.server");
    return run(context.supabase, list as never, { manual: true });
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notifications")
      .select("id, kind, title, body, job_id, read_at, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return {
      rows: rows ?? [],
      unread: (rows ?? []).filter((r) => !r.read_at).length,
    };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ workspaceId: z.string().uuid(), ids: z.array(z.string().uuid()).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId)
      .is("read_at", null);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

/**
 * First-touch setup captured on the list progress screen while the scrape runs.
 * Stored on the list's params so the Campaign Builder can prefill from it —
 * skipping it changes nothing, the builder just collects it later.
 */
export const setListFirstTouch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        jobId: z.string().uuid(),
        industry: z.string().max(40).nullable().optional(),
        messageAngle: z.string().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertJobAction } = await import("./accountability.server");
    await assertJobAction(context.supabase, data.jobId, context.userId, "build_list");
    const { data: job, error: readError } = await context.supabase
      .from("jobs")
      .select("params")
      .eq("id", data.jobId)
      .maybeSingle();
    if (readError) throw readError;
    if (!job) throw new Error("List Not Found");
    const params = { ...((job.params ?? {}) as Record<string, unknown>) };
    if (data.industry !== undefined) params.industry = data.industry;
    if (data.messageAngle !== undefined) params.message_angle = data.messageAngle;
    const { error } = await context.supabase
      .from("jobs")
      .update({ params } as never)
      .eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });
