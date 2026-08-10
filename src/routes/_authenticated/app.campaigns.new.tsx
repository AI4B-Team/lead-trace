import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { launchCampaignFromJob } from "@/lib/jobs.functions";
import { updateCampaignConfig, previewCampaign, scheduleCampaignDrops } from "@/lib/campaigns.functions";
import { getRegistration } from "@/lib/numbers.functions";
import { TagPicker } from "@/components/app/tag-picker";
import { useWorkspaceAgent } from "@/hooks/use-agent";
import { BotTrainer } from "@/components/app/bot-trainer";
import { Zap, CalendarClock, BadgeCheck, ArrowRight, Users, Database, Upload, Bot, Landmark, Search, Check } from "lucide-react";
import {
  WizardProgress,
  CampaignHealthPanel,
  CampaignSummaryPanel,
  AiSuggestionsPanel,
  PhonePreview,
  SequenceAnalytics,
  LaunchReview,
} from "@/components/app/campaign-builder-rail";
import {
  projectCampaign,
  healthChecks,
  deliverability,
  aiSuggestions,
  personalizationScore,
  readingSeconds,
  spamScore,
  replyLift,
  totalReplyRate,
  renderSample,
} from "@/lib/campaign-insights";
import { humanDelay } from "@/components/app/drip-editor";
import { listNumbers } from "@/lib/numbers.functions";
import { DEFAULT_DROP_TIMES, formatTime12 } from "@/lib/drops";
import { TimePicker12h } from "@/components/app/time-picker-12h";
import { DripEditor, type DripStep } from "@/components/app/drip-editor";

export const Route = createFileRoute("/_authenticated/app/campaigns/new")({
  head: () => ({ meta: [{ title: "New Campaign — LeadTrace" }] }),
  component: NewCampaign,
});

const DEFAULT_STEPS: DripStep[] = [
  { step_order: 1, delay_minutes: 0, body: "Hi {{first_name}} — quick question about your {{niche}} in {{city}}?" },
  { step_order: 2, delay_minutes: 180, body: "Following up — any interest?" },
  { step_order: 3, delay_minutes: 60 * 24 * 2, body: "Still exploring options in {{city}}? Happy to send info." },
  { step_order: 4, delay_minutes: 60 * 24 * 5, body: "Last check-in — want me to close this out?" },
];

function NewCampaign() {
  const { workspaceId } = useWorkspaceId();
  const navigate = useNavigate();
  const launchFn = useServerFn(launchCampaignFromJob);
  const configFn = useServerFn(updateCampaignConfig);
  const previewFn = useServerFn(previewCampaign);
  const scheduleFn = useServerFn(scheduleCampaignDrops);
  const fetchReg = useServerFn(getRegistration);
  const { data: regData } = useQuery({
    queryKey: ["registration", workspaceId],
    queryFn: () => fetchReg({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
  const regReady = regData?.registration?.campaign_status === "approved";

  const [selectedJob, setSelectedJob] = useState<string>("");
  const [name, setName] = useState("");
  const [dailyCap, setDailyCap] = useState(500);
  const [quietStart, setQuietStart] = useState("21:00");
  const [quietEnd, setQuietEnd] = useState("09:00");
  const [tagId, setTagId] = useState<string | null>(null);
  const { agent } = useWorkspaceAgent(workspaceId);
  const brandId = agent?.id ?? null;
  const [dropSize, setDropSize] = useState(500);
  const [dropTimes, setDropTimes] = useState<string[]>(DEFAULT_DROP_TIMES);
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [startTime, setStartTime] = useState("10:00");
  const [duplicatePolicy, setDuplicatePolicy] = useState<"skip" | "resend">("skip");
  const [steps, setSteps] = useState<DripStep[]>(DEFAULT_STEPS);
  const [saving, setSaving] = useState(false);

  const { data: jobs } = useQuery({
    queryKey: ["ready-jobs", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, source_type, record_type, status, rows_in, rows_deduped, rows_skiptraced, created_at, params")
        .eq("workspace_id", workspaceId!)
        .eq("status", "ready")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!workspaceId,
  });

  // Review preview: real recipient count, duplicates found, drop plan, and
  // estimated credit cost before anything is created.
  // Instant = first drop leaves immediately; scheduled = first drop at the
  // chosen local date/time, remaining drops follow the drop-time slots.
  const startAt =
    sendMode === "schedule"
      ? new Date(`${startDate}T${startTime}:00`).toISOString()
      : new Date().toISOString();

  const { data: preview } = useQuery({
    queryKey: [
      "campaign-preview",
      selectedJob,
      dropSize,
      dropTimes,
      sendMode,
      sendMode === "schedule" ? startAt : "now",
      steps.map((s) => s.body).join("|"),
    ],
    queryFn: () =>
      previewFn({
        data: {
          jobId: selectedJob,
          dropSize,
          dropTimes,
          bodies: steps.map((s) => s.body),
          startAt,
          instant: sendMode === "now",
        },
      }),
    enabled: !!selectedJob,
  });

  const submit = async (mode: "now" | "schedule" = sendMode) => {
    if (!brandId) return toast.error("Set Up Your AI Agent First");
    if (!selectedJob) return toast.error("Pick A Ready List First");
    if (!name.trim()) return toast.error("Name Your Campaign");
    const cleanSteps = steps.filter((s) => s.body.trim().length > 0);
    if (!cleanSteps.length) return toast.error("Write At Least One Message");
    const when =
      mode === "schedule" ? new Date(`${startDate}T${startTime}:00`) : new Date();
    if (mode === "schedule" && Number.isNaN(when.getTime())) return toast.error("Pick A Valid Send Date & Time");
    setSaving(true);
    try {
      const { campaignId } = await launchFn({ data: { jobId: selectedJob, name: name.trim() } });
      await configFn({
        data: {
          campaignId,
          daily_cap: dailyCap,
          quiet_start: quietStart,
          quiet_end: quietEnd,
          tag_id: tagId,
          brand_id: brandId,
          drop_size: dropSize,
          drop_times: dropTimes,
          duplicate_policy: duplicatePolicy,
          steps: cleanSteps.map((s, i) => ({
            step_order: i + 1,
            delay_minutes: s.delay_minutes,
            message_variants: [s.body.trim().slice(0, 320)],
          })),
        },
      });
      await scheduleFn({
        data: {
          campaignId,
          recipients: preview?.recipients ?? 0,
          startAt: when.toISOString(),
          instant: mode === "now",
        },
      });
      toast.success(mode === "now" ? "Campaign Created — First Drop Sending Now" : "Campaign Scheduled");
      navigate({ to: "/app/campaigns/$campaignId", params: { campaignId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create Failed");
    } finally {
      setSaving(false);
    }
  };


  const fetchNumbers = useServerFn(listNumbers);
  const { data: numbers } = useQuery({
    queryKey: ["numbers", workspaceId],
    queryFn: () => fetchNumbers({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
  const numberRows = Array.isArray(numbers) ? numbers : (numbers?.rows ?? []);
  const activeNumbers = numberRows.filter((n) => n.status !== "cooling").length;

  const cleanSteps = steps.filter((s) => s.body.trim().length > 0);
  const bodies = cleanSteps.map((s) => s.body);
  const selectedJobRow = jobs?.find((j) => j.id === selectedJob);
  const listName = selectedJobRow
    ? ((selectedJobRow.params ?? {}) as { name?: string }).name ?? `List ${selectedJobRow.id.slice(0, 8)}`
    : "";
  const brandName = agent?.name ?? "";
  // First-touch setup captured on the list progress screen carries in here as
  // the default guidance for the sequence.
  const carried = (selectedJobRow?.params ?? {}) as { industry?: string | null; message_angle?: string | null };
  const carriedAngle = carried.message_angle?.trim() || "";
  const recipients = preview?.recipients ?? selectedJobRow?.rows_deduped ?? 0;
  const totalDelayMinutes = cleanSteps.reduce((n, s) => n + s.delay_minutes, 0);
  const projection = projectCampaign({ recipients, bodies, dailyCap, totalDelayMinutes });
  const spam = bodies.length
    ? bodies.map((b) => spamScore(b)).sort((a, b) => (a.level === "High" ? -1 : b.level === "High" ? 1 : 0))[0]!
    : { level: "Low" as const, reasons: [] };
  const quietValid = quietStart !== quietEnd;
  const dropTimesValid = dropTimes.every((t) => Number(t.slice(0, 2)) < 18 && Number(t.slice(0, 2)) >= 8);
  const checks = healthChecks({
    registered: !!regReady,
    brandPicked: !!brandId,
    listPicked: !!selectedJob,
    numbersAvailable: activeNumbers,
    quietValid,
    dropTimesValid,
  });
  const deliverabilityPct = deliverability(checks, spam.level);
  const suggestions = aiSuggestions({ touches: cleanSteps, bodies, dailyCap, recipients });
  const replyRate = totalReplyRate(cleanSteps.length);
  const sampleLead = { first_name: "John", city: "Tampa", state: "FL", niche: "Roof", address: "412 Maple St" };
  const previewMessages = cleanSteps.slice(0, 4).map((s, i) => ({
    label: i === 0 ? "Touch 1 · Immediately" : `Touch ${i + 1} · ${humanDelay(s.delay_minutes)}`,
    body: renderSample(s.body, sampleLead),
  }));
  const wizardSteps = [
    { id: "name", label: "Campaign Name", done: name.trim().length > 0 },
    { id: "brand", label: "Your AI Agent", done: !!brandId },
    { id: "list", label: "Choose List", done: !!selectedJob },
    { id: "sending", label: "Configure Sending", done: dropTimes.length > 0 && dailyCap > 0 },
    { id: "sequence", label: "Review Sequence", done: cleanSteps.length > 0 },
    { id: "launch", label: "Launch", done: false },
  ];
  const activeStepId = wizardSteps.find((s) => !s.done)?.id ?? "launch";

  return (
    <div>
      <PageHeader
        title="New Campaign"
        description="Name It, Teach It, Load A Clean List — Then Launch."
        actions={<Button asChild variant="outline" className="rounded-full"><Link to="/app/campaigns">Cancel</Link></Button>}
      />

      {regData && !regReady && (
        <div className="mb-6 rounded-2xl border border-warn/30 bg-warn/5 p-4 flex flex-wrap items-center gap-3">
          <BadgeCheck className="h-5 w-5 text-warn" />
          <div className="text-sm text-muted-foreground">
            <span className="font-display font-bold text-foreground">Register Your Texting Brand To Send.</span>{" "}
            Carrier Approval Takes A Few Days — Build This Campaign Now, And Sending Unlocks The Moment It Clears.
          </div>
          <Button asChild size="sm" className="rounded-full ml-auto">
            <Link to="/app/registration">Finish Setup <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="min-w-0">
          <Step id="name" n={1} title="Campaign Name" hint="Name It First — Everything Else Attaches To This Campaign.">
            <Card>
              <CardContent className="pt-6 grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 Roof Homeowners — Tampa" />
                </div>
                {workspaceId && <TagPicker workspaceId={workspaceId} value={tagId} onChange={setTagId} />}
              </CardContent>
            </Card>
          </Step>

          <Step id="brand" n={2} title="Your AI Agent" hint="Your Agent Only Speaks From Knowledge You Approve.">
            <Card>
              <CardContent className="pt-6 space-y-4">
                {brandId ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Speaking As
                        </div>
                        <div className="font-display font-bold text-foreground">{brandName}</div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="rounded-full ml-auto">
                        <Link to="/app/agent">Manage Agent</Link>
                      </Button>
                    </div>
                    <BotTrainer key={brandId} brandId={brandId} heading={`Train ${brandName}`} />
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center">
                    <Bot className="h-5 w-5 text-primary mx-auto" />
                    <div className="font-display font-bold text-foreground mt-2">Set Up Your AI Agent</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Every Campaign Speaks As Your Workspace's Agent — Create It Once, Then Train It With Text,
                      Dictation, Files Or URLs.
                    </div>
                    <Button asChild className="rounded-full mt-4">
                      <Link to="/app/agent">Set Up Agent</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </Step>

          <Step id="list" n={3} title="Choose List" hint="Only Clean, Scrubbed Lists Can Be Loaded.">
            {!jobs?.length ? (
              <Card><CardContent className="pt-6 text-sm text-muted-foreground">No Ready Lists Yet. Run A List First.</CardContent></Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {jobs.map((j) => (
                  <ListCard key={j.id} job={j} active={j.id === selectedJob} onSelect={() => setSelectedJob(j.id)} />
                ))}
              </div>
            )}
          </Step>

          <Step id="sending" n={4} title="Configure Sending" hint="Pacing, Drop Times And Quiet Hours.">
            <Card>
              <CardContent className="pt-6 grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Daily Cap (Per Campaign)</Label>
                    <Input type="number" min={1} max={5000} value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label>Drop Size</Label>
                    <Input type="number" min={50} max={5000} step={50} value={dropSize} onChange={(e) => setDropSize(Number(e.target.value) || 500)} />
                    <div className="text-[11px] text-muted-foreground mt-1">Operator-Proven Default: 500 Contacts Per Drop.</div>
                  </div>
                  <div>
                    <Label>Duplicates</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(["skip", "resend"] as const).map((p) => (
                        <Button
                          key={p}
                          type="button"
                          size="sm"
                          variant={duplicatePolicy === p ? "default" : "outline"}
                          className="rounded-full h-8"
                          onClick={() => setDuplicatePolicy(p)}
                        >
                          {p === "skip" ? "Skip Already-Messaged" : "Allow Resend"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>When To Send</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant={sendMode === "now" ? "default" : "outline"} className="rounded-full h-8" onClick={() => setSendMode("now")}>
                        <Zap className="h-3.5 w-3.5 mr-1" /> Send Instantly
                      </Button>
                      <Button type="button" size="sm" variant={sendMode === "schedule" ? "default" : "outline"} className="rounded-full h-8" onClick={() => setSendMode("schedule")}>
                        <CalendarClock className="h-3.5 w-3.5 mr-1" /> Schedule Drop
                      </Button>
                    </div>
                    {sendMode === "now" ? (
                      <div className="text-[11px] text-muted-foreground mt-2">
                        First Drop Goes Out Right Away. Remaining Drops Follow Your Drop Times Below.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                        <Label className="text-xs">First Drop Date & Time</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-[160px]" />
                          <TimePicker12h value={startTime} onChange={setStartTime} />
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Starts {formatTime12(startTime)} Local · Compliant Outreach Runs 8:00 AM – 8:00 PM Recipient
                          Local Time, And A New Drop Never Starts After 6:00 PM.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Drop Times (Local)</Label>
                    <div className="mt-1 grid gap-2">
                      {dropTimes.map((t, i) => (
                        <TimePicker12h key={i} value={t} onChange={(v) => setDropTimes(dropTimes.map((x, idx) => (idx === i ? v : x)))} />
                      ))}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">New Drops Never Start After 6:00 PM Recipient Local Time.</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Quiet Start</Label>
                      <TimePicker12h value={quietStart} onChange={setQuietStart} className="mt-1" />
                    </div>
                    <div>
                      <Label>Quiet End</Label>
                      <TimePicker12h value={quietEnd} onChange={setQuietEnd} className="mt-1" />
                    </div>
                  </div>
                  {preview && (
                    <div className="rounded-xl border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="uppercase tracking-wider">Channel Eligibility</span>
                        <Badge variant="secondary" className="font-normal">
                          {(preview.eligibility?.sms ?? 0).toLocaleString()} SMS-Eligible
                        </Badge>
                        <Badge variant="secondary" className="font-normal">
                          {(preview.eligibility?.email ?? 0).toLocaleString()} Email-Eligible
                        </Badge>
                        <Badge variant="secondary" className="font-normal">
                          {(preview.eligibility?.mail ?? 0).toLocaleString()} Direct-Mail-Eligible
                        </Badge>
                      </div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                        {preview.drops.length} Drop{preview.drops.length === 1 ? "" : "s"} · {dropSize} Contacts Each ·{" "}
                        {preview.duplicates.toLocaleString()} Duplicates Removed
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 text-xs">
                        {preview.drops.slice(0, 6).map((d) => (
                          <div key={d.drop_index} className="rounded-lg bg-surface-muted px-3 py-2">
                            <div className="font-semibold text-foreground">Drop {d.drop_index}</div>
                            <div className="text-muted-foreground">{new Date(d.scheduled_at).toLocaleString()} · {d.size}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Step>

          <Step id="sequence" n={5} title="Review Sequence" hint="Each Touch Waits Its Own Duration Before Sending.">
            {carriedAngle && (
              <div className="mb-4 rounded-xl border border-border bg-primary/5 p-3">
                <p className="text-xs font-semibold text-foreground">First-Touch Angle From This List</p>
                <p className="mt-1 text-sm text-muted-foreground">{carriedAngle}</p>
              </div>
            )}
            <DripEditor steps={steps} onChange={setSteps} />
            {cleanSteps.length > 0 && (
              <SequenceAnalytics
                touches={cleanSteps.map((s, i) => ({
                  label: `Touch ${i + 1}`,
                  delay: s.delay_minutes,
                  lift: replyLift(i),
                  chars: s.body.trim().length,
                }))}
              />
            )}
          </Step>

          <Step id="launch" n={6} title="Launch" hint="Everything Is Checked Before The First Message Leaves.">
            <LaunchReview
              projection={projection}
              checks={checks}
              saving={saving}
              onLaunch={() => submit("now")}
              onSchedule={() => {
                setSendMode("schedule");
                void submit("schedule");
              }}
              scheduleLabel={saving ? "Working…" : "Schedule Drop Instead"}
            />
          </Step>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <WizardProgress steps={wizardSteps} active={activeStepId} />
          <CampaignSummaryPanel
            name={name}
            brandName={brandName}
            listName={listName}
            projection={projection}
            replyRate={replyRate}
          />
          <CampaignHealthPanel
            checks={checks}
            deliverability={deliverabilityPct}
            perDay={projection.perDay}
            durationDays={projection.durationDays}
          />
          <AiSuggestionsPanel suggestions={suggestions} replyRate={replyRate} />
          <PhonePreview
            messages={previewMessages}
            lead={{ name: "John Miller", context: `${listName || "Cook County Probate"} · Tampa, FL` }}
            readingSeconds={readingSeconds(bodies)}
            spam={spam.level}
            personalization={personalizationScore(bodies)}
          />
        </aside>
      </div>
    </div>
  );
}

const SOURCE_ICONS: Record<string, typeof Database> = {
  records: Landmark,
  business: Search,
  upload: Upload,
  assistant: Bot,
};

/** Rich list card: volume, source, freshness and quality signals. */
function ListCard({
  job,
  active,
  onSelect,
}: {
  job: {
    id: string;
    source_type: string;
    record_type?: string | null;
    rows_in?: number | null;
    rows_deduped?: number | null;
    rows_skiptraced?: number | null;
    created_at: string;
    params?: unknown;
  };
  active: boolean;
  onSelect: () => void;
}) {
  const params = (job.params ?? {}) as { name?: string };
  const rowsIn = job.rows_in ?? job.rows_deduped ?? 0;
  const clean = job.rows_deduped ?? 0;
  const cleanPct = rowsIn ? Math.round((clean / rowsIn) * 100) : 100;
  const traced = job.rows_skiptraced ?? 0;
  const tracedPct = clean ? Math.round((traced / clean) * 100) : 0;
  const Icon = SOURCE_ICONS[job.source_type] ?? Database;
  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-2xl border-2 p-4 transition hover:-translate-y-0.5 hover:shadow-md ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-bold text-foreground truncate">
            {params.name ?? `List ${job.id.slice(0, 8)}`}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            <span className="capitalize">{job.source_type}</span>
            <span>·</span>
            <span>{formatWhen(job.created_at)}</span>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full border-success/40 text-success gap-1 shrink-0">
          {active ? <Check className="h-3 w-3" /> : null} Ready
        </Badge>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-2xl font-black text-foreground">{clean.toLocaleString()}</span>
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Clean Leads</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <QualityChip label="Clean" value={`${cleanPct}%`} />
        <QualityChip label="Skip Traced" value={`${tracedPct}%`} />
        <QualityChip label="DNC Removed" value={(rowsIn - clean).toLocaleString()} />
      </div>
    </button>
  );
}

function QualityChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (diff < 2 * day) return `Yesterday, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/** Numbered section wrapper so the builder reads top-to-bottom. */
function Step({
  id,
  n,
  title,
  hint,
  children,
}: {
  id: string;
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`step-${id}`} className="mb-8 scroll-mt-24">
      <div className="flex items-center gap-3 mb-3">
        <span className="grid place-items-center h-7 w-7 rounded-full bg-primary text-primary-foreground font-display font-bold text-xs shrink-0">
          {n}
        </span>
        <div>
          <h2 className="font-display font-bold text-lg text-foreground leading-tight">{title}</h2>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}
