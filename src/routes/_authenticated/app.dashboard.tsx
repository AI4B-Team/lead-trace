import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { GettingStarted } from "@/components/app/getting-started";
import { ScanDigest } from "@/components/app/scan-digest";
import { QuickRun } from "@/components/app/quick-run";
import { DashboardTemplates } from "@/components/app/dashboard-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type JobStatus } from "@/lib/job-status";
import { supabase } from "@/integrations/supabase/client";
import { isRunningStatus, isStalled } from "@/lib/job-watchdog";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { assignJobNames, cadenceBadge } from "@/lib/job-naming";
import {
  Users, ListChecks, MessageSquare, CreditCard, Plus, ArrowUpRight, Landmark, MapPin,
  Upload, TrendingUp, Info, Activity, Zap, CheckCircle2, HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { ActivityList, useActivity } from "@/components/app/activity-feed";
import { NeedsReplyCard } from "@/components/app/needs-reply";
import { WaitingOnYou } from "@/components/app/waiting-on-you";

export const Route = createFileRoute("/_authenticated/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — LeadTrace" }] }),
  component: Dashboard,
});

type JobRow = {
  id: string;
  name: string | null;
  cadence: string | null;
  source_type: string;
  status: JobStatus;
  rows_in: number | null;
  created_at: string;
};

type Credits = { scrape: number; skip_trace: number; sms: number };
type CreditTotals = Credits;

type ActivityItem = {
  tone: "leads" | "done" | "reply" | "credit";
  text: string;
  at: string | null;
};

const SOURCE_META: Record<string, { icon: typeof MapPin; label: string }> = {
  business: { icon: MapPin, label: "Business Search" },
  records: { icon: Landmark, label: "Public Records" },
  upload: { icon: Upload, label: "Uploaded List" },
};

function relative(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins}m Ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h Ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d Ago`;
}

function Dashboard() {
  const { workspaceId } = useWorkspaceId();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [metrics, setMetrics] = useState({
    leads: 0, lists: 0, sending: 0, scheduled: 0, deliverability: 0, leadsToday: 0, processing: 0,
  });
  const [credits, setCredits] = useState<Credits>({ scrape: 0, skip_trace: 0, sms: 0 });
  const [creditTotals, setCreditTotals] = useState<CreditTotals>({ scrape: 0, skip_trace: 0, sms: 0 });
  const [weekly, setWeekly] = useState<Array<{ day: string; count: number }>>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  // Until the first metrics round-trip lands, zeros are a lie ("you have no
  // leads/lists"). Everything numeric renders as a dash while loading.
  const [loaded, setLoaded] = useState(false);

  // Recent Activity replaces the old credit card: what happened, not accounting.
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    (async () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const [doneCamps, replies, spend] = await Promise.all([
        supabase
          .from("campaigns")
          .select("name, created_at")
          .eq("workspace_id", workspaceId)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(2),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("direction", "inbound")
          .gte("created_at", startOfToday.toISOString()),
        supabase
          .from("credit_ledger")
          .select("delta")
          .eq("workspace_id", workspaceId)
          .lt("delta", 0)
          .gte("created_at", startOfToday.toISOString()),
      ]);
      if (!active) return;
      const items: ActivityItem[] = [];
      for (const c of (doneCamps.data ?? []) as Array<{ name: string; created_at: string }>) {
        items.push({ tone: "done", text: `${c.name} Campaign Completed`, at: c.created_at });
      }
      const replyCount = replies.count ?? 0;
      if (replyCount) items.push({ tone: "reply", text: `${replyCount} New ${replyCount === 1 ? "Reply" : "Replies"}`, at: null });
      const used = ((spend.data ?? []) as Array<{ delta: number }>).reduce((s, r) => s + Math.abs(Number(r.delta ?? 0)), 0);
      if (used) items.push({ tone: "credit", text: `${used.toLocaleString()} Credits Used Today`, at: null });
      setActivity(items);
    })();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      const since = new Date(Date.now() - 6 * 86400000);
      since.setHours(0, 0, 0, 0);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [jobsRes, leadsRes, listsRes, campRes, numRes, credRes, recentLeads, procRes, ledgerRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, params, record_type, schedule, source_type, status, rows_in, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
        supabase
          .from("campaigns")
          .select("status")
          .eq("workspace_id", workspaceId)
          .in("status", ["scheduled", "sending"]),
        supabase.from("sending_numbers").select("health_score").eq("workspace_id", workspaceId),
        supabase.from("credit_balances").select("kind, balance").eq("workspace_id", workspaceId),
        supabase
          .from("leads")
          .select("created_at")
          .eq("workspace_id", workspaceId)
          .gte("created_at", since.toISOString()),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .in("status", ["scraping", "enriching", "skiptracing", "scrubbing"]),
        supabase
          .from("credit_ledger")
          .select("kind, delta")
          .eq("workspace_id", workspaceId)
          .gt("delta", 0),
      ]);

      const rawJobs = (jobsRes.data ?? []) as Array<{
        id: string;
        params: Record<string, unknown> | null;
        record_type: string | null;
        schedule: string | null;
        source_type: string;
        status: JobStatus;
        rows_in: number | null;
        created_at: string;
      }>;
      // Names are numbered across the whole workspace so repeat runs of the
      // same search read as "· Run #2" instead of looking like duplicates.
      const names = assignJobNames(
        rawJobs.map((j) => ({
          id: j.id,
          source_type: j.source_type,
          record_type: j.record_type,
          params: j.params,
          created_at: j.created_at,
        })),
      );
      setJobs(
        rawJobs.slice(0, 5).map((j) => ({
          id: j.id,
          name: names.get(j.id)?.name ?? "Untitled List",
          cadence: cadenceBadge(j.schedule),
          source_type: j.source_type,
          status: j.status,
          rows_in: j.rows_in,
          created_at: j.created_at,
        })),
      );

      const nums = (numRes.data ?? []) as Array<{ health_score: number | null }>;
      const deliverability = nums.length
        ? Math.round(nums.reduce((s, n) => s + Number(n.health_score ?? 0), 0) / nums.length)
        : 0;

      const leadRows = (recentLeads.data ?? []) as Array<{ created_at: string }>;
      const buckets: Array<{ day: string; count: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const next = new Date(d.getTime() + 86400000);
        buckets.push({
          day: d.toLocaleDateString(undefined, { weekday: "short" }),
          count: leadRows.filter((r) => {
            const t = new Date(r.created_at).getTime();
            return t >= d.getTime() && t < next.getTime();
          }).length,
        });
      }
      setWeekly(buckets);

      const campRows = (campRes.data ?? []) as Array<{ status: string }>;
      // Running counts only genuinely active jobs (§23): a running stage with
      // no progress events for 2h is stalled, not processing.
      const runningJobs = rawJobs.filter((j) => isRunningStatus(j.status));
      let activeCount = procRes.count ?? runningJobs.length;
      if (runningJobs.length) {
        const { data: evts } = await supabase
          .from("job_events")
          .select("job_id, created_at")
          .in("job_id", runningJobs.map((j) => j.id))
          .order("created_at", { ascending: false });
        const last = new Map<string, string>();
        for (const e of (evts ?? []) as Array<{ job_id: string | null; created_at: string }>) {
          if (e.job_id && !last.has(e.job_id)) last.set(e.job_id, e.created_at);
        }
        activeCount = runningJobs.filter(
          (j) => !isStalled({ status: j.status, lastEventAt: last.get(j.id) ?? null, createdAt: j.created_at }),
        ).length;
      }
      setMetrics({
        leads: leadsRes.count ?? 0,
        lists: listsRes.count ?? 0,
        sending: campRows.filter((c) => c.status === "sending").length,
        scheduled: campRows.filter((c) => c.status === "scheduled").length,
        deliverability,
        leadsToday: leadRows.filter((r) => new Date(r.created_at) >= startOfToday).length,
        processing: activeCount,
      });

      const bal: Credits = { scrape: 0, skip_trace: 0, sms: 0 };
      for (const row of (credRes.data ?? []) as Array<{ kind: keyof Credits; balance: number }>) {
        if (row.kind in bal) bal[row.kind] = row.balance;
      }
      setCredits(bal);

      // Plan allowance = total credits granted this period, so every bar is
      // honestly "remaining ÷ allowance".
      const totals: CreditTotals = { scrape: 0, skip_trace: 0, sms: 0 };
      for (const row of (ledgerRes.data ?? []) as Array<{ kind: keyof Credits; delta: number }>) {
        if (row.kind in totals) totals[row.kind] += Number(row.delta ?? 0);
      }
      for (const k of Object.keys(totals) as Array<keyof Credits>) {
        totals[k] = Math.max(totals[k], bal[k]);
      }
      setCreditTotals(totals);
    })();
  }, [workspaceId]);

  const hasJobs = jobs.length > 0;
  const totalCredits = credits.scrape + credits.skip_trace + credits.sms;
  // Dashboard mirrors the account-wide activity slide-out.
  const { data: activityData } = useActivity(workspaceId ?? null, "all", 6);
  const realActivity = activityData?.events ?? [];
  // Job completions come from the jobs list we already loaded.
  const activityFeed = useMemo<ActivityItem[]>(() => {
    const jobItems: ActivityItem[] = jobs
      .filter((j) => (j.rows_in ?? 0) > 0)
      .slice(0, 3)
      .map((j) => ({
        tone: "leads" as const,
        text: `${(j.rows_in ?? 0).toLocaleString()} New Contacts · ${j.name ?? "List"}`,
        at: j.created_at,
      }));
    return [...jobItems, ...activity].slice(0, 6);
  }, [jobs, activity]);
  // A full drip is 4 touches per contact.
  const dripMessages = useMemo(() => Math.round(metrics.leads * 4), [metrics.leads]);
  const peak = Math.max(1, ...weekly.map((w) => w.count));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A live look at your leads, lists, campaigns, and deliverability."
      />

      {/* Unfinished setup is pinned above everything: it's what blocks the next action. */}
      <GettingStarted workspaceId={workspaceId ?? null} />

      {/* Hero metric */}
      <div className="mb-6 rounded-2xl border border-border bg-ink text-ink-foreground p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">Contacts Ready</div>
          <div className="mt-1 font-display text-5xl font-black leading-none">
            {metrics.leads.toLocaleString()}
          </div>
          <p className="mt-3 text-sm opacity-75">
            Enough for a full 4-message drip sequence — <span className="font-semibold opacity-100">≈{dripMessages.toLocaleString()} messages</span>
          </p>
        </div>
        <div className="mt-5 flex items-start gap-12 sm:mt-0">
          <TooltipProvider delayDuration={150}>
            <HeroStat label="Added Today" value={`+${metrics.leadsToday.toLocaleString()}`} />
            <HeroStat
              label="Deliverability"
              value={metrics.deliverability ? `${metrics.deliverability}%` : "—"}
              info={metrics.deliverability ? undefined : "Starts Tracking With Your First Campaign"}
            />
            <HeroStat label="Credits" value={totalCredits.toLocaleString()} />
          </TooltipProvider>
        </div>
      </div>

      {/* Composition order locked by spec §18: digest + stats → quick run → checklist → templates.
          The needs-reply callout sits first: a hot lead who just replied outranks everything. */}
      <div className="mb-6">
        <NeedsReplyCard />
      </div>
      {/* Approvals are part of the daily brief, not a destination of their own. */}
      <div className="mb-6">
        <WaitingOnYou workspaceId={workspaceId ?? null} />
      </div>
      <ScanDigest workspaceId={workspaceId ?? null} />
      <TooltipProvider>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Metric
            icon={<ListChecks className="h-4 w-4" />}
            label="Lists"
            value={metrics.lists.toString()}
            note={metrics.processing ? `${metrics.processing} Running` : "All Processed"}
            noteTone={metrics.processing ? "success" : undefined}
            help="The number of lists you have built or uploaded, including one-time and recurring lists."
          />
          <Metric
            icon={<MessageSquare className="h-4 w-4" />}
            label="Live Campaigns"
            value={(metrics.sending + metrics.scheduled).toString()}
            note={
              metrics.sending + metrics.scheduled
                ? `${metrics.sending} Sending · ${metrics.scheduled} Scheduled`
                : undefined
            }
            noteNode={
              metrics.sending + metrics.scheduled ? undefined : (
                <>
                  None Running Yet —{" "}
                  <Link to="/app/campaigns/new" className="font-semibold text-primary underline-offset-2 hover:underline">
                    Launch Your First
                  </Link>
                </>
              )
            }
            help="Campaigns that are currently sending or scheduled to send messages."
          />
        </div>
      </TooltipProvider>

      <QuickRun />

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-display">Recent Lists</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/lists">View All <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {hasJobs ? (
              <div className="divide-y divide-border">
                {jobs.map((j) => {
                  const meta = SOURCE_META[j.source_type] ?? { icon: MapPin, label: "List" };
                  const Icon = meta.icon;
                  return (
                    <Link
                      key={j.id}
                      to="/app/lists/$listId"
                      params={{ listId: j.id }}
                      className="-mx-2 flex items-start gap-4 rounded-lg px-2 py-3 hover:bg-surface-muted"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-4.5 w-4.5" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-display text-sm font-bold text-foreground">
                            {j.name}
                          </span>
                          {j.cadence && (
                            <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              {j.cadence}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta.label}</div>
                      </div>
                      {/* Fixed columns: Contacts / Status / Time — all top-aligned. */}
                      <div className="hidden w-20 shrink-0 text-right sm:block">
                        <div className="text-sm font-semibold tabular-nums text-foreground">
                          {(j.rows_in ?? 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Rows</div>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <StatusBadge status={j.status} />
                      </div>
                      <div className="w-20 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                        {relative(j.created_at)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center">
                <div className="text-sm text-muted-foreground">No Lists Yet.</div>
                <Button asChild className="mt-4 rounded-full">
                  <Link to="/app/assistant"><Plus className="mr-1 h-4 w-4" /> Build Your First List</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Activity className="h-4 w-4 text-primary" /> Recent Activity
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/inbox">Inbox <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </CardHeader>
            <CardContent className={realActivity.length ? "px-0" : undefined}>
              {realActivity.length ? (
                <ActivityList events={realActivity} />
              ) : activityFeed.length ? (
                <ul className="divide-y divide-border">
                  {activityFeed.map((item, i) => (
                    <li key={`${item.text}-${i}`} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        {item.tone === "reply" ? (
                          <MessageSquare className="h-3.5 w-3.5" />
                        ) : item.tone === "credit" ? (
                          <Zap className="h-3.5 w-3.5" />
                        ) : item.tone === "done" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Users className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-foreground">{item.text}</span>
                      {item.at && (
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {relative(item.at)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nothing Yet — Activity Shows Up Once Your First List Runs.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <TrendingUp className="h-4 w-4 text-primary" /> Lead Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2" style={{ height: 128 }}>
                {weekly.map((w, i) => (
                  <div key={`${w.day}-${i}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {w.count || ""}
                    </span>
                    <div
                      className="w-full shrink-0 rounded-t-md bg-primary/80 transition-all"
                      style={{ height: Math.max(4, Math.round((w.count / peak) * 92)) }}
                    />
                    <span className="text-[10px] text-muted-foreground">{w.day}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Last 7 Days · {weekly.reduce((s, w) => s + w.count, 0).toLocaleString()} Contacts Added
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <DashboardTemplates />
    </div>
  );
}

function HeroStat({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="min-w-0 shrink-0">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="truncate">{label}</span>
        {info && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 shrink-0 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top">{info}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums whitespace-nowrap">
        {value}
      </div>
    </div>
  );
}

function Metric({
  icon, label, value, note, noteNode, noteTone, help,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  noteNode?: React.ReactNode;
  noteTone?: "success";
  help?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
            {icon} {label}
          </div>
          {help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p>{help}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-2 font-display text-3xl font-black text-foreground">{value}</div>
        {(noteNode ?? note) && (
          <div className={`mt-1 text-xs font-medium ${noteTone === "success" ? "text-success" : "text-muted-foreground"}`}>
            {noteNode ?? note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
