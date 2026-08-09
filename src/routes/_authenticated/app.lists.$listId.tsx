import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { skipSummaryCopy } from "@/lib/refunds.shared";
import { formatLocation } from "@/lib/location";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Link } from "@tanstack/react-router";
import { getListMonitor, setListMonitor } from "@/lib/property-scan.functions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, MessageSquare, Activity, ShieldCheck, Ban, AlertTriangle, Loader2, Users, Search, Eye, Pause, Play, Clock, Check, Copy, Smartphone, Scale, Rocket, Hourglass, Send, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { getJobReview, getLeadsByBucket, launchCampaignFromJob, listJobEvents, listJobLeads, listJobs, pauseJob, resumeJob, setListFirstTouch } from "@/lib/jobs.functions";
import { Textarea } from "@/components/ui/textarea";
import { useReferenceData } from "@/hooks/use-reference-data";
import { RESCRUB_DAYS } from "@/lib/compliance-rules";
import { PipelineFunnel } from "@/components/app/pipeline-funnel";
import { normalizeChannel, channelPrimaryAction, CHANNEL_LEAD_NOUN } from "@/lib/channels";
import { buildFunnel, funnelViolations } from "@/lib/funnel-math";
import { enrichmentProfile, isDataSource, isNonUsRun } from "@/lib/pipeline-options";
import { exportShapeFor, shapeExportRows, cleanFileType } from "@/lib/export-columns";
import { populatedFields, resultFieldsForTemplate, type CustomFieldSchema, type LeadField } from "@/lib/lead-fields";
import { launchEstimate, formatUsd } from "@/lib/launch-estimate";
import { usePlanContext } from "@/hooks/use-plan-context";
import { planFor } from "@/lib/plans.shared";
import { LOCAL_TZ } from "@/lib/local-tz";
import { PhoneLink } from "@/components/app/phone-link";
import { setOnboardingPref } from "@/lib/onboarding.functions";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { isStalled, stallReason } from "@/lib/job-watchdog";
import { qualityGrade } from "@/lib/quality-grade";
import { brandedFileName, brandedJobTitle, BUCKET_FILE_TYPE } from "@/lib/download-name";
import { type ExportFormat } from "@/lib/export-file";
import { guardedExport } from "@/lib/guarded-export";
import { isTrustedProvenance, UNTRUSTED_LIST_MESSAGE } from "@/lib/provenance.shared";
import { useTeamContext } from "@/hooks/use-team-context";
import { denialMessage } from "@/lib/team-roles.shared";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileSpreadsheet, FileText, Files } from "lucide-react";
import { ChevronDown, Database, Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/lists/$listId")({
  head: () => ({ meta: [{ title: "Pipeline Review — LeadTrace" }] }),
  component: JobDetail,
});

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued", scraping: "Scraping", enriching: "Enriching",
  skiptracing: "Skip Tracing", scrubbing: "Scrubbing", ready: "Ready", failed: "Needs Attention",
  paused: "Paused",
};

function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function JobDetail() {
  const { listId: jobId } = Route.useParams();
  const team = useTeamContext();
  const navigate = useNavigate();
  const fetchReview = useServerFn(getJobReview);
  const fetchBucket = useServerFn(getLeadsByBucket);
  const fetchEvents = useServerFn(listJobEvents);
  const doPause = useServerFn(pauseJob);
  const doResume = useServerFn(resumeJob);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserBucket, setBrowserBucket] = useState<"clean" | "dnc" | "litigator" | "all">("clean");
  const [logOpen, setLogOpen] = useState(true);
  const [legacyDismissed, setLegacyDismissed] = useState(false);
  // Nobody rereads the log once the run lands — collapse it on completion.
  const [collapsedOnce, setCollapsedOnce] = useState(false);
  // SMS is quoted at the workspace's own plan rate, not the entry-level price.
  const { plan: planContext } = usePlanContext();
  const smsRate = planFor(planContext.plan).smsPerSegment;

  const { data, isLoading, isError, error: reviewError } = useQuery({
    queryKey: ["job-review", jobId],
    queryFn: () => fetchReview({ data: { jobId, timeZone: LOCAL_TZ } }),
    retry: false,
    refetchInterval: (q) => {
      const s = q.state.data?.job?.status;
      return s && s !== "ready" && s !== "failed" && s !== "paused" ? 2000 : false;
    },
  });

  const { data: eventData } = useQuery({
    queryKey: ["job-events", jobId],
    queryFn: () => fetchEvents({ data: { jobId } }),
    refetchInterval: (q) => (data?.job?.status === "ready" || data?.job?.status === "failed" ? false : 2000),
  });

  if (isError || (!isLoading && !data)) {
    const msg = reviewError instanceof Error ? reviewError.message : "";
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="font-display">
            {/List Not Found/i.test(msg) ? "This List Isn't Available" : "Could Not Load This List"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {/List Not Found/i.test(msg)
              ? "It may have been deleted, or it belongs to a different workspace than the one you have open."
              : "Something went wrong loading this pipeline. Try again in a moment."}
          </p>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/app/lists">Back To Lists</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Pipeline…</div>;
  }

  const { job, counts, quality } = data;
  const scrubFreshness = data.scrubFreshness;
  const isReady = job.status === "ready";
  const isRunning = !isReady && job.status !== "failed" && job.status !== "paused";
  // Stuck-job watchdog (§23): no progress events for 2h on a running stage.
  const lastEventAt = (eventData?.events ?? []).at(-1)?.created_at ?? null;
  const stalled = isStalled({ status: job.status, lastEventAt, createdAt: job.created_at as string });
  const params = (job.params ?? {}) as Record<string, unknown>;
  // Coverage report the pipeline stamped on the run: which counties actually
  // contributed rows, and which we don't cover yet.
  const coverage = params.coverage as
    | {
        requested: number;
        ran: number;
        coveredCounties: string[];
        uncoveredCounties: string[];
      }
    | undefined;
  const jobName =
    data.displayName ??
    String(params.name ?? params.file_name ?? `${job.source_type} · ${job.id.slice(0, 8)}`);

  // Elapsed / throughput / ETA from the job clock and the rows already processed.
  const startedAt = new Date(job.created_at as string).getTime();
  const endedAt = isRunning
    ? Date.now()
    : new Date((scrubFreshness.scrubbedAt ?? job.last_run_at ?? job.created_at) as string).getTime();
  const elapsedMs = Math.max(1000, endedAt - startedAt);
  const processed = counts.total || (job.rows_deduped ?? 0) || (job.rows_in ?? 0);
  const perMin = Math.round(processed / (elapsedMs / 60000));
  const target = Math.max(processed, job.rows_in ?? 0);
  const etaMs = perMin > 0 && target > processed ? ((target - processed) / perMin) * 60000 : 0;

  // Canonical funnel math — one computation feeds the bars, the KPI strip, and
  // the arithmetic guard below.
  // Creator sources deliver emails, not dials — their funnel, KPI strip and
  // export columns all follow the creator layout.
  const runTemplateId = typeof params.templateId === "string" ? params.templateId : null;
  // A custom/requested adapter can declare its own output fields on the run;
  // when it hasn't, columns are inferred from the rows themselves.
  const runOutputFields = (Array.isArray(params.output_fields)
    ? params.output_fields
    : Array.isArray(params.outputFields)
      ? params.outputFields
      : null) as CustomFieldSchema | null;
  const isCreatorRun = enrichmentProfile(runTemplateId) === "creator";
  // Research datasets have no compliance pipeline: Found -> Deduped -> Exported.
  const isDataRun = isDataSource(runTemplateId);
  const nonUsRun = isNonUsRun({
    templateId: runTemplateId,
    country: typeof params.country === "string" ? params.country : null,
  });
  // The list's outreach channel decides what the run can do at the end. SMS is
  // the only channel with a sending engine; email and direct mail are exports.
  const channel = normalizeChannel((job as { channel?: string | null }).channel ?? null);
  // SMS is US-only, and a dataset isn't contactable — neither can launch.
  const campaignable = !isDataRun && !nonUsRun && channel === "sms";
  const funnelVariant =
    isDataRun || channel === "direct_mail"
      ? "data"
      : isCreatorRun || channel === "email"
        ? "creator"
        : "phone";
  const funnel = buildFunnel(
    {
      found: job.rows_in ?? 0,
      deduped: job.rows_deduped ?? 0,
      verified: job.rows_enriched ?? counts.total,
      traced: job.rows_skiptraced ?? 0,
      scrubbed: counts.total,
      clean: counts.clean,
    },
    { variant: funnelVariant },
  );
  const traced = job.rows_skiptraced ?? 0;
  const sourceLabel =
    job.source_type === "upload"
      ? "Uploaded CSV"
      : job.source_type === "records"
        ? "Public Records"
        : "Business Directories";
  const messageTemplates = (data as { messageTemplates?: string[] }).messageTemplates ?? [];
  // A dataset isn't contactable and SMS is US-only, so neither quotes a launch.
  const estimate = campaignable
    ? launchEstimate(counts.clean, {
        templates: messageTemplates,
        ratePerSegment: smsRate,
      })
    : null;
  const grade = qualityGrade(quality);
  // Never ship a funnel whose arithmetic disagrees with the Ready To Send card.
  // This runs in production too: on mismatch we surface a reconciling badge
  // rather than silently rendering numbers that don't add up.
  const funnelIssues = funnelViolations(funnel, { readyToSend: counts.clean });
  if (funnelIssues.length) console.warn("[funnel] arithmetic mismatch:", funnelIssues);

  if (job.status === "ready" && !collapsedOnce) {
    setCollapsedOnce(true);
    setLogOpen(false);
  }

  const toggleRun = async () => {
    try {
      if (job.status === "paused" || job.status === "failed") {
        await doResume({ data: { jobId } });
        toast.success("Run Resumed");
      } else {
        await doPause({ data: { jobId } });
        toast.success("Run Paused");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Update Run");
    }
  };

  const onDownload = async (bucket: "clean" | "dnc" | "litigator", format: ExportFormat) => {
    if (!team.can("export_list")) {
      return toast.error("Export Blocked", { description: denialMessage(team.role, "export_list") });
    }
    const res = await fetchBucket({ data: { jobId, bucket } });
    if (!res.rows.length) return toast.info("No Rows In This Bucket.");
    const type = BUCKET_FILE_TYPE[bucket];
    const label = bucket === "clean" ? cleanFileType(runTemplateId) : type;
    const rows = shapeExportRows(res.rows as Array<Record<string, unknown>>, exportShapeFor(runTemplateId), runTemplateId);
    // Attributed, capped and watermarked before a single byte is written.
    await guardedExport({
      workspaceId: team.workspaceId,
      rows,
      format,
      scope: `${label} · ${jobName}`,
      refId: jobId,
      fileName: (ext) => brandedFileName(jobName, label, ext),
      sheetName: label,
    });
  };

  // Scrub audit trail: provider, timestamp and per-bucket outcome, exportable.
  const onExportAudit = async () => {
    const s = data.scrub as Record<string, unknown> | null;
    if (!s) return toast.info("No Scrub Run Recorded Yet.");
    await guardedExport({
      workspaceId: team.workspaceId,
      format: "csv",
      scope: `Scrub Audit · ${jobName}`,
      refId: jobId,
      fileName: (ext) => brandedFileName(jobName, "Scrub Audit", ext),
      rows: [{
        job: jobName,
        provider: s.provider ?? "internal",
        scrubbed_at: s.created_at,
        total: s.total ?? counts.total,
        clean: s.clean_count ?? counts.clean,
        dnc: s.dnc_count ?? counts.dnc,
        litigator: s.litigator_count ?? counts.litigator,
      }],
    });
  };

  return (
    <div>
      <PageHeader
        title={brandedJobTitle(jobName)}
        description="Pipeline Review · Every Row Passed Through De-Dupe, Enrich, Skip Trace, And Scrub."
        actions={
          <>
            <Badge variant="outline" className="text-sm">
              {STATUS_LABEL[job.status ?? "queued"] ?? job.status}
            </Badge>
            {data.cadenceBadge && (
              <Badge variant="secondary" className="text-sm">{data.cadenceBadge}</Badge>
            )}
            {(isRunning || job.status === "paused" || job.status === "failed") && (
              <Button variant="outline" className="rounded-full" onClick={toggleRun}>
                {isRunning ? <><Pause className="mr-1 h-4 w-4" /> Pause</> : <><Play className="mr-1 h-4 w-4" /> Resume</>}
              </Button>
            )}
            <LeadsBrowser
              jobId={jobId}
              templateId={runTemplateId}
              outputFields={runOutputFields}
              disabled={!isReady}
              open={browserOpen}
              onOpenChange={setBrowserOpen}
              bucket={browserBucket}
              onBucketChange={setBrowserBucket}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Records Found" value={funnel[0]!.remaining.toLocaleString()} />
        <Stat label="Unique Records" value={funnel[1]!.remaining.toLocaleString()} />
        {isDataRun ? (
          <>
            <Stat label="Exported Rows" value={funnel[2]!.remaining.toLocaleString()} />
            <Stat label="Deliverable" value="Dataset" muted />
          </>
        ) : (
          <>
        <Stat label={isCreatorRun ? "Email Found" : "Verified"} value={funnel[2]!.remaining.toLocaleString()} />
        {isCreatorRun ? (
          <Stat label="Contact Emails" value={counts.clean.toLocaleString()} />
        ) : (
          <Stat
            label="Traced"
            value={traced > 0 ? traced.toLocaleString() : "Not Needed"}
            muted={traced === 0}
          />
        )}
          </>
        )}
      </div>

      {!isTrustedProvenance((job as { data_provenance?: string }).data_provenance) &&
        !legacyDismissed && (
          <div className="mt-6 flex flex-wrap items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-warn" />
            <div className="min-w-[12rem] flex-1">
              <div className="text-sm font-semibold text-foreground">Unverified Legacy Records</div>
              <div className="text-sm text-muted-foreground">{UNTRUSTED_LIST_MESSAGE}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setLegacyDismissed(true)}>
              Dismiss
            </Button>
          </div>
        )}

      {coverage && coverage.uncoveredCounties.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4">
          <AlertTriangle className="h-4 w-4 text-warn" />
          <div className="min-w-[12rem] flex-1">
            <div className="text-sm font-semibold text-foreground">
              Ran {coverage.ran} of {coverage.requested} selected counties
            </div>
            <div className="text-sm text-muted-foreground">
              {coverage.uncoveredCounties.length} not yet covered — we've logged your request.
              Contributing counties: {coverage.coveredCounties.join(", ") || "none"}. Not covered:{" "}
              {coverage.uncoveredCounties.join(", ")}.
            </div>
          </div>
        </div>
      )}

      {job.status === "failed" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <div className="min-w-[12rem] flex-1">
            <div className="text-sm font-semibold text-foreground">
              Run Failed{job.failed_stage ? ` During ${String(job.failed_stage)}` : ""}
            </div>
            <div className="text-sm text-muted-foreground">
              {job.error ?? "Something went wrong before this run finished."} Any credits this run
              spent were refunded.
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={toggleRun}>
            <Play className="mr-1 h-4 w-4" /> Retry
          </Button>
        </div>
      )}

      {stalled && job.status !== "failed" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4">
          <AlertTriangle className="h-4 w-4 text-warn" />
          <span className="text-sm font-semibold text-foreground">Needs Attention — {stallReason(job.status)}</span>
          <Button variant="outline" size="sm" className="rounded-full" onClick={toggleRun}>
            <Play className="mr-1 h-4 w-4" /> Retry
          </Button>
        </div>
      )}

      {scrubFreshness.stale && isReady && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold text-foreground">
            {scrubFreshness.scrubbedAt
              ? `This List Was Scrubbed ${scrubFreshness.ageDays} Days Ago.`
              : "This List Has No Recorded Scrub."}{" "}
            Re-Scrub Before Launching — Campaigns Require A Scrub Newer Than {RESCRUB_DAYS} Days.
          </span>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-display">Lead Processing</CardTitle>
          {funnelIssues.length > 0 && (
            <Badge
              variant="outline"
              className="border-warn/50 bg-warn/10 text-warn"
              title={funnelIssues.join(" · ")}
            >
              <AlertTriangle className="mr-1 h-3 w-3" /> Counts Are Being Reconciled
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <PipelineFunnel
            animate={isReady}
            traced={traced}
            variant={funnelVariant}
            stages={{
              found: job.rows_in ?? 0,
              deduped: job.rows_deduped ?? 0,
              verified: job.rows_enriched ?? counts.total,
              skipTraced: traced,
              scrubbed: counts.total,
              clean: counts.clean,
            }}
          />
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setLogOpen((v) => !v)}
              aria-expanded={logOpen}
            >
              <span className="text-sm font-semibold text-foreground">
                {isReady ? "Pipeline Complete" : "Live Progress"}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                {logOpen ? "Hide Processing Details" : "View Processing Details"}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${logOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {logOpen && (
            <>
            <ul className="mt-3 space-y-2">
              {(eventData?.events ?? []).map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm text-foreground">
                  <span className="text-xs text-muted-foreground tabular-nums pt-0.5 shrink-0">
                    {new Date(e.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="mt-0.5 shrink-0">
                    <EventIcon stage={e.stage} message={e.message} />
                  </span>
                  <span>{e.message}</span>
                </li>
              ))}
              {!(eventData?.events ?? []).length && (
                <li className="text-sm text-muted-foreground">Waiting For The First Stage To Report…</li>
              )}
            </ul>
            {!isReady && (
              <div className="mt-3 text-xs text-muted-foreground">
                You Can Close This Tab — The Run Keeps Going On Our Servers.
              </div>
            )}
            </>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {isRunning ? (
              <>
                <MiniStat icon={<Clock className="h-3 w-3" />} label="Elapsed" value={fmtDuration(elapsedMs)} />
                <MiniStat icon={<Activity className="h-3 w-3" />} label="Rate" value={perMin > 0 ? `${perMin.toLocaleString()} Records/Min` : "—"} />
                <MiniStat icon={<Hourglass className="h-3 w-3" />} label="Est. Time Left" value={etaMs > 0 ? `~${fmtDuration(etaMs)}` : "Finishing Up"} />
                <MiniStat icon={<Database className="h-3 w-3" />} label="Source" value={sourceLabel} />
              </>
            ) : (
              <>
                <MiniStat
                  icon={<Check className="h-3 w-3" />}
                  label="Completed"
                  value={`${new Date(endedAt).toLocaleDateString([], { month: "short", day: "numeric" })} • ${new Date(endedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                />
                <MiniStat icon={<Clock className="h-3 w-3" />} label="Processing Time" value={fmtDuration(elapsedMs)} />
                <MiniStat
                  icon={<Coins className="h-3 w-3" />}
                  label="Credits Used"
                  value={(data.creditsUsed ?? 0).toLocaleString()}
                />
                <MiniStat
                  icon={<Database className="h-3 w-3" />}
                  label="Source"
                  value={sourceLabel}
                  tone={scrubFreshness.stale ? "danger" : "default"}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {(data.skippedRecords > 0 || (data.refunds?.skipped ?? 0) > 0) && (
        <div className="mt-4 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
          {skipSummaryCopy({
            count: data.skippedRecords,
            noun: params.source_type === "street_scan" ? "properties" : "records",
            credits: data.refunds?.skipped ?? 0,
          }) ||
            `Some records couldn't be checked and weren't charged (${(data.refunds?.skipped ?? 0).toLocaleString()} credits back).`}
        </div>
      )}

      {params.source_type === "street_scan" && <MonitorListCard jobId={jobId} workspaceId={team.workspaceId} />}

      {isRunning && campaignable && (
        <FirstTouchCard
          jobId={jobId}
          initialIndustry={typeof params.industry === "string" ? params.industry : null}
          initialAngle={typeof params.message_angle === "string" ? params.message_angle : null}
        />
      )}

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <BucketCard
          tone="success"
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Clean"
          count={counts.clean}
          note="Ready To Send"
          ready={isReady}
          onDownload={(f) => onDownload("clean", f)}
          onView={() => { setBrowserBucket("clean"); setBrowserOpen(true); }}
        />
        <BucketCard
          tone="warn"
          icon={<Ban className="h-4 w-4" />}
          title="DNC"
          count={counts.dnc}
          note="Download For Suppression"
          ready={isReady}
          onDownload={(f) => onDownload("dnc", f)}
          onView={() => { setBrowserBucket("dnc"); setBrowserOpen(true); }}
        />
        <BucketCard
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Litigator"
          count={counts.litigator}
          note="Download For Analytics"
          ready={isReady}
          onDownload={(f) => onDownload("litigator", f)}
          onView={() => { setBrowserBucket("litigator"); setBrowserOpen(true); }}
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-display">List Quality Score</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`font-display text-4xl font-black leading-none ${
                grade.tone === "success" ? "text-success" : grade.tone === "warn" ? "text-warn" : "text-danger"
              }`}
            >
              {isReady ? grade.letter : "—"}
            </span>
            <div className="h-8 w-px bg-border" aria-hidden="true" />
            <span className="font-display text-2xl font-black tabular-nums text-foreground">
              {isReady ? quality : "—"}<span className="text-sm text-muted-foreground">/100</span>
            </span>
            <div className="h-8 w-px bg-border" aria-hidden="true" />
            {isReady && <span className="text-sm font-semibold text-muted-foreground">{grade.label}</span>}
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Blends Clean Rate, Mobile Rate, And Reachability. Higher Score = Hotter Raw Source.
        </CardContent>
      </Card>

      {/* The money moment: what launching this list reaches and costs. */}
      {isReady && counts.clean > 0 && estimate && (
        <Card className="mt-6 border-primary/40 bg-primary/5">
          <CardHeader className="flex flex-row items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-display">Launch Estimate</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MoneyStat
              icon={<Smartphone className="h-3.5 w-3.5" />}
              value={estimate.reach.toLocaleString()}
              label="Launch-Ready Leads"
              note={isCreatorRun || channel === "email" ? "Contact Emails" : "Mobile Phones"}
            />
            <MoneyStat
              icon={<Send className="h-3.5 w-3.5" />}
              value={estimate.messages.toLocaleString()}
              label="Messages"
              note={`${estimate.steps}-Step Drip · ${estimate.segments.toLocaleString()} Segments`}
            />
            <MoneyStat
              icon={<DollarSign className="h-3.5 w-3.5" />}
              value={`${estimate.assumed ? "From ≈ " : "≈ "}${formatUsd(estimate.cost)}`}
              label="Estimated Cost"
              note={
                estimate.assumed
                  ? `Assumes 1 Segment Per Message · $${estimate.ratePerSegment.toFixed(3)} Per Segment`
                  : `$${estimate.ratePerSegment.toFixed(3)} Per Segment · Measured From Your Templates`
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Celebratory sticky finish line. */}
      <div className="sticky bottom-4 z-10 mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/40 bg-background/95 p-4 shadow-lg backdrop-blur">
          <div className="flex items-center gap-3">
            {isReady && counts.clean > 0 && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            )}
            <div>
              <div className="font-display text-base font-black text-foreground">
                {isReady
                  ? counts.clean > 0
                    ? isDataRun ? "Your Dataset Is Ready" : "Your List Is Ready"
                    : isDataRun ? "No Rows In This Run" : "No Clean Leads In This Run"
                  : "Building Your List…"}
              </div>
              <div className="text-xs text-muted-foreground">
                {isReady && counts.clean > 0
                  ? `${counts.clean.toLocaleString()} ${
                      isDataRun
                        ? "Rows — Research Dataset, Not Contactable Leads"
                        : nonUsRun
                          ? "Records — Email-Ready (SMS Is US-Only)"
                          : isCreatorRun
                            ? "Creators With Contact Emails"
                            : CHANNEL_LEAD_NOUN[channel]
                    }`
                  : isReady
                    ? "Try A Wider Area Or Another Niche."
                    : "You Can Close This Tab — We Keep Working."}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="rounded-full" onClick={onExportAudit}>
              <Download className="mr-1 h-4 w-4" /> Scrub Audit
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => navigate({ to: "/app/lists" })}>
              Back To Lists
            </Button>
            {campaignable ? (
              <LaunchCampaignDialog defaultJobId={jobId} defaultJobName={jobName} />
            ) : (
              isReady &&
              counts.clean > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {channelPrimaryAction(channel).note}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MoneyStat({ icon, label, value, note }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="font-display text-4xl font-black leading-none tabular-nums text-foreground">{value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-foreground/80">
        {icon} {label}
      </div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

// Launch a campaign from ANY ready list in the workspace, not just this one.
function LaunchCampaignDialog({ defaultJobId, defaultJobName }: { defaultJobId: string; defaultJobName: string }) {
  const navigate = useNavigate();
  const { workspaceId } = useWorkspaceId();
  const fetchJobs = useServerFn(listJobs);
  const launch = useServerFn(launchCampaignFromJob);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultJobId);
  const [name, setName] = useState(`${defaultJobName} — Campaign`);
  const [launching, setLaunching] = useState(false);

  const { data } = useQuery({
    queryKey: ["launchable-jobs", workspaceId],
    queryFn: () => fetchJobs({ data: { workspaceId: workspaceId!, timeZone: LOCAL_TZ } }),
    enabled: open && !!workspaceId,
  });

  const options = (data?.jobs ?? []).filter((j) => j.status === "ready" && j.counts.clean > 0);

  const pick = (id: string) => {
    setSelected(id);
    const j = options.find((o) => o.id === id);
    if (j) setName(`${j.name} — Campaign`);
  };

  const onLaunch = async () => {
    if (!selected) return toast.error("Pick A List First.");
    if (!name.trim()) return toast.error("Name Your Campaign.");
    setLaunching(true);
    try {
      const { campaignId } = await launch({ data: { jobId: selected, name: name.trim() } });
      toast.success("Campaign Created With Clean File Only.");
      setOpen(false);
      navigate({ to: "/app/campaigns/$campaignId", params: { campaignId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Launch Campaign.");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full">
          <MessageSquare className="mr-1 h-4 w-4" /> Launch Campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Launch Campaign</DialogTitle>
          <DialogDescription>
            Pick Any Ready List. Only Clean Rows Are Attached — DNC And Litigator Stay Download-Only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>List / File</Label>
            <Select value={selected} onValueChange={pick}>
              <SelectTrigger><SelectValue placeholder="Choose A Ready List" /></SelectTrigger>
              <SelectContent>
                {options.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">No Ready Lists With Clean Rows Yet.</div>
                )}
                {options.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.name} · {j.counts.clean.toLocaleString()} Clean
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Campaign Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign Name" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="rounded-full" disabled={launching || !selected} onClick={onLaunch}>
            {launching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-1 h-4 w-4" />}
            Launch Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Bucket = "clean" | "dnc" | "litigator" | "all";

type LeadRow = {
  id: string;
  full_name: string | null;
  business_name: string | null;
  phone: string | null;
  phone_type: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  scrub_status: string | null;
  zip?: string | null;
  source_meta?: unknown;
};

function LeadsBrowser({ jobId, templateId, outputFields, disabled, open, onOpenChange, bucket, onBucketChange }: {
  jobId: string;
  templateId: string | null;
  outputFields?: CustomFieldSchema | null;
  disabled: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bucket: Bucket;
  onBucketChange: (b: Bucket) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<LeadRow | null>(null);
  const fetchLeads = useServerFn(listJobLeads);
  const markReviewed = useServerFn(setOnboardingPref);
  useEffect(() => {
    if (open) markReviewed({ data: { reviewedCleanList: true } }).catch(() => {});
  }, [open, markReviewed]);
  const { data, isFetching } = useQuery({
    queryKey: ["job-leads", jobId, bucket, q],
    queryFn: () => fetchLeads({ data: { jobId, bucket, search: q || undefined, limit: 100 } }),
    enabled: open,
  });
  const leads = (data?.leads ?? []) as LeadRow[];
  // A single run has ONE output shape, so its results columns come straight
  // from that template's output schema — never a phone column for a source
  // that can't produce phones.
  const fields = populatedFields(
    resultFieldsForTemplate(templateId, leads as Array<Record<string, unknown>>, outputFields),
    leads as Array<Record<string, unknown>>,
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" className="rounded-full" disabled={disabled}>
          <Users className="mr-1 h-4 w-4" /> Browse Leads
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Leads In This List</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email…" className="pl-9" />
          </div>
          <Select value={bucket} onValueChange={(v) => onBucketChange(v as Bucket)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clean">Clean</SelectItem>
              <SelectItem value="dnc">DNC</SelectItem>
              <SelectItem value="litigator">Litigator</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 space-y-2">
          {isFetching && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isFetching && leads.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">No Leads Match.</div>
          )}
          {leads.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActive(l)}
              className="w-full text-left rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-foreground">
                  {fields[0]?.value(l as Record<string, unknown>) ?? l.full_name ?? l.business_name ?? "—"}
                </div>
                <Badge
                  variant="outline"
                  className={
                    l.scrub_status === "clean" ? "text-success border-success/30 bg-success/10" :
                    l.scrub_status === "dnc" ? "text-warn border-warn/30 bg-warn/10" :
                    "text-danger border-danger/30 bg-danger/10"
                  }
                >
                  {l.scrub_status}
                </Badge>
              </div>
              {/* Remaining schema fields, in the run's own output order. */}
              <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {fields.slice(1).map((f: LeadField) => {
                  const v = f.value(l as Record<string, unknown>);
                  return (
                    <div key={f.key} className="flex min-w-0 items-center gap-1">
                      <dt className="uppercase tracking-wide text-muted-foreground/70">{f.label}</dt>
                      <dd className="min-w-0 truncate text-foreground/90">
                        {f.key === "phone" && v ? (
                          <>
                            <PhoneLink phone={v} />
                            {l.phone_type ? ` · ${l.phone_type}` : ""}
                          </>
                        ) : (
                          v ?? "—"
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </button>
          ))}
          {leads.length === 100 && (
            <div className="text-xs text-muted-foreground text-center pt-2">Showing First 100 · Refine Search To See More.</div>
          )}
        </div>
        <ContactDetailDialog lead={active} onClose={() => setActive(null)} />
      </SheetContent>
    </Sheet>
  );
}

function ContactDetailDialog({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">
            {lead?.full_name ?? lead?.business_name ?? "Contact Details"}
          </DialogTitle>
          <DialogDescription>Full Record As Delivered After Enrichment And Scrubbing.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-3 gap-y-3 text-sm">
          <DetailRow label="Name" value={lead?.full_name} />
          <DetailRow label="Business" value={lead?.business_name} />
          <dt className="col-span-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground pt-0.5">Phone</dt>
          <dd className="col-span-2 text-foreground break-words">
            <PhoneLink phone={lead?.phone} />
          </dd>
          <DetailRow label="Line Type" value={lead?.phone_type} />
          <DetailRow label="Email" value={lead?.email} />
          <DetailRow label="Address" value={lead?.address} />
          <DetailRow label="City" value={lead?.city} />
          <DetailRow label="State" value={lead?.state} />
          <DetailRow label="Scrub Status" value={lead?.scrub_status} />
        </dl>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="col-span-1 text-xs uppercase tracking-wider font-semibold text-muted-foreground pt-0.5">{label}</dt>
      <dd className="col-span-2 text-foreground break-words">{value || "—"}</dd>
    </>
  );
}

function Stat({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm font-semibold text-muted-foreground">{label}</div>
        <div
          className={`mt-2 font-display font-black tabular-nums ${
            muted ? "text-xl text-muted-foreground" : "text-3xl text-foreground"
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skimmable icon per progress line so users can scan the run at a glance.
 * Chosen from the stage first, then narrowed by what the message reports.
 */
function EventIcon({ stage, message }: { stage: string | null; message: string }) {
  const m = message.toLowerCase();
  const cls = "h-3.5 w-3.5";
  if (/litigator/.test(m)) return <Scale className={`${cls} text-danger`} />;
  if (/dnc/.test(m) && /flagged|removed/.test(m)) return <Ban className={`${cls} text-warn`} />;
  if (/duplicate/.test(m)) return <Copy className={`${cls} text-muted-foreground`} />;
  switch (stage) {
    case "queued":
      return <Hourglass className={`${cls} text-muted-foreground`} />;
    case "scraping":
      return <Search className={`${cls} text-muted-foreground`} />;
    case "enriching":
      return <Copy className={`${cls} text-muted-foreground`} />;
    case "skiptracing":
      return <Smartphone className={`${cls} text-muted-foreground`} />;
    case "scrubbing":
      return <ShieldCheck className={`${cls} text-warn`} />;
    case "ready":
      return <Check className={`${cls} text-success`} strokeWidth={3} />;
    default:
      return <Activity className={`${cls} text-muted-foreground`} />;
  }
}

// Compact run telemetry used under the funnel: elapsed, rate, ETA, scrub stamp.
function MiniStat({ label, value, tone = "default", icon }: { label: string; value: string; tone?: "default" | "danger"; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function BucketCard({ tone, icon, title, count, note, ready, onDownload, onView }: {
  tone: "success" | "warn" | "danger";
  icon: React.ReactNode;
  title: string;
  count: number;
  note: string;
  ready: boolean;
  onDownload: (format: ExportFormat) => void;
  onView: () => void;
}) {
  const toneClasses = {
    success: "border-success/30 bg-success/5",
    warn: "border-warn/30 bg-warn/5",
    danger: "border-danger/30 bg-danger/5",
  }[tone];
  const textTone = { success: "text-success", warn: "text-warn", danger: "text-danger" }[tone];
  return (
    <div className={`rounded-2xl border p-6 ${toneClasses}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${textTone}`}>
        {icon} {title}
      </div>
      <div className="mt-2 font-display text-4xl font-black text-foreground">
        {ready ? count.toLocaleString() : "—"}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{note}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" disabled={!ready || count === 0} onClick={onView}>
          <Eye className="mr-1 h-3.5 w-3.5" /> View
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="rounded-full" disabled={!ready || count === 0}>
              <Download className="mr-1 h-3.5 w-3.5" /> Download
              <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Download As</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onDownload("csv")}>
              <FileText className="mr-2 h-4 w-4" /> CSV (.csv)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownload("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownload("both")}>
              <Files className="mr-2 h-4 w-4" /> Both Files
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
/**
 * Campaign setup collected while the scrape runs — it's dead time otherwise,
 * and both values carry into the Campaign Builder as defaults. Skipping it is
 * fine: the builder still asks for them later.
 */
function FirstTouchCard({
  jobId,
  initialIndustry,
  initialAngle,
}: {
  jobId: string;
  initialIndustry: string | null;
  initialAngle: string | null;
}) {
  const { industries } = useReferenceData();
  const save = useServerFn(setListFirstTouch);
  const [industry, setIndustry] = useState(initialIndustry ?? "");
  const [angle, setAngle] = useState(initialAngle ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const commit = async (next: { industry?: string | null; messageAngle?: string | null }) => {
    setSaving(true);
    try {
      await save({ data: { jobId, ...next } });
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Save First Touch");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-display">
            While We Build Your List — Set Up Your First Touch
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional. Whatever you set here becomes the default in your Campaign Builder.
          </p>
        </div>
        {saving ? (
          <Badge variant="outline" className="shrink-0">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Saving
          </Badge>
        ) : saved ? (
          <Badge variant="outline" className="shrink-0 border-success/50 bg-success/10 text-success">
            <Check className="mr-1 h-3 w-3" /> Saved
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Industry Preset
          </Label>
          <Select
            value={industry}
            onValueChange={(v) => {
              setIndustry(v);
              void commit({ industry: v || null });
            }}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Pick An Industry" /></SelectTrigger>
            <SelectContent>
              {industries.map((i) => (
                <SelectItem key={i.slug} value={i.slug}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Sets the tone and compliance defaults for messaging.
          </p>
        </div>
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            First-Touch Angle
          </Label>
          <Textarea
            className="mt-1"
            rows={3}
            value={angle}
            placeholder="Empathetic, low-pressure opener…"
            onChange={(e) => setAngle(e.target.value)}
            onBlur={() => {
              if ((initialAngle ?? "") === angle && !saved) return;
              void commit({ messageAngle: angle.trim() || null });
            }}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            How the first text should come across. Nothing sends without your approval.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Monitor. A standing subscription against this saved list, not a build mode:
 * we re-score the same houses on a cadence and alert when one gets worse.
 * Growth tier and above, because re-scoring carries ongoing imagery cost.
 */
function MonitorListCard({ jobId, workspaceId }: { jobId: string; workspaceId: string | null }) {
  const { plan } = useTeamContext();
  const gated = plan === "starter";
  const load = useServerFn(getListMonitor);
  const save = useServerFn(setListMonitor);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["list-monitor", jobId],
    queryFn: () => load({ data: { listId: jobId } }),
  });
  const monitor = data?.monitor as
    | { cadence: string; active: boolean; alert_on: Record<string, unknown>; next_run_at: string | null }
    | null
    | undefined;

  const [pending, setPending] = useState(false);
  const cadence = (monitor?.cadence === "quarterly" ? "quarterly" : "monthly") as "monthly" | "quarterly";
  const alertOnTarp = monitor?.alert_on?.["tarp_appeared"] !== false;

  const commit = async (next: { active?: boolean; cadence?: "monthly" | "quarterly"; alertOnTarp?: boolean }) => {
    if (!workspaceId || gated) return;
    setPending(true);
    try {
      await save({
        data: {
          workspaceId,
          listId: jobId,
          active: next.active ?? monitor?.active ?? false,
          cadence: next.cadence ?? cadence,
          alertOnTarp: next.alertOnTarp ?? alertOnTarp,
        },
      });
      await qc.invalidateQueries({ queryKey: ["list-monitor", jobId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Update Monitoring");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-display">Monitor This List</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            We re-score these houses on a schedule and tell you when one gets worse — a tarp appears, a yard goes to
            overgrowth. {monitor?.next_run_at ? `Next check ${new Date(monitor.next_run_at).toLocaleDateString()}.` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={Boolean(monitor?.active)}
            disabled={gated || pending || !workspaceId}
            onCheckedChange={(v) => void commit({ active: v })}
            aria-label="Monitor this list"
          />
        </div>
      </CardHeader>
      {gated ? (
        <CardContent>
          <div className="rounded-xl border border-border bg-primary/5 p-3 text-xs text-muted-foreground">
            Monitoring is available on Growth and above.{" "}
            <Link to="/app/billing" className="font-semibold text-primary underline">Upgrade</Link>
          </div>
        </CardContent>
      ) : (
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadence</Label>
            <Select value={cadence} onValueChange={(v) => void commit({ cadence: v as "monthly" | "quarterly" })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Alert On New Damage
              </Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Notify me when a tarp or fresh damage shows up, or the condition score jumps.
              </p>
            </div>
            <Switch
              checked={alertOnTarp}
              disabled={pending}
              onCheckedChange={(v) => void commit({ alertOnTarp: v })}
              aria-label="Alert on new damage"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
