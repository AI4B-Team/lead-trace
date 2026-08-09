import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  MessageSquare,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthRow, planTone, type WsRow } from "@/components/app/admin-shared";
import {
  countLegacyLeads,
  listAllWorkspaces,
  listCronHealth,
  purgeLegacyLeads,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

function formatEvery(minutes: number): string {
  if (minutes >= 1440) return `Every ${minutes / 1440 === 1 ? "Day" : `${minutes / 1440} Days`}`;
  if (minutes >= 60) return `Every ${minutes / 60 === 1 ? "Hour" : `${minutes / 60} Hours`}`;
  return `Every ${minutes === 1 ? "Minute" : `${minutes} Minutes`}`;
}

export const Route = createFileRoute("/_authenticated/platform/")({
  head: () => ({
    meta: [
      { title: "Platform Dashboard — LeadTrace" },
      {
        name: "description",
        content: "Platform health, usage, and growth across every LeadTrace workspace.",
      },
    ],
  }),
  component: PlatformDashboard,
});

function PlatformDashboard() {
  const fetchAll = useServerFn(listAllWorkspaces);
  const fetchLegacy = useServerFn(countLegacyLeads);
  const runPurge = useServerFn(purgeLegacyLeads);
  const fetchCron = useServerFn(listCronHealth);
  const legacyQ = useQuery({ queryKey: ["admin-legacy-leads"], queryFn: () => fetchLegacy() });
  const cronQ = useQuery({
    queryKey: ["admin-cron-health"],
    queryFn: () => fetchCron(),
    refetchInterval: 60_000,
  });
  const wsQ = useQuery({
    queryKey: ["admin-workspaces"],
    queryFn: () => fetchAll(),
  });

  const all = (wsQ.data?.workspaces ?? []) as WsRow[];
  const t = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return {
      workspaces: all.length,
      leads: all.reduce((s, w) => s + (w.stats.leads ?? 0), 0),
      sentMonth: all.reduce((s, w) => s + (w.stats.sent_month ?? 0), 0),
      sentAll: all.reduce((s, w) => s + (w.stats.sent ?? 0), 0),
      numbers: all.reduce((s, w) => s + (w.stats.numbers ?? 0), 0),
      paid: all.filter((w) => (w.billing_plan ?? "trial") === "paid").length,
      trial: all.filter((w) => (w.billing_plan ?? "trial") === "trial").length,
      comped: all.filter((w) => w.billing_plan === "comped").length,
      pastDue: all.filter((w) => w.billing_plan === "past_due").length,
      new30: all.filter((w) => w.created_at && new Date(w.created_at).getTime() >= cutoff).length,
    };
  }, [all]);

  const conversion = t.paid + t.trial > 0 ? Math.round((t.paid / (t.paid + t.trial)) * 100) : 0;
  const topUsage = useMemo(
    () => [...all].sort((a, b) => b.stats.sent_month - a.stats.sent_month).slice(0, 5),
    [all],
  );
  const recent = useMemo(
    () =>
      [...all]
        .sort(
          (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        )
        .slice(0, 6),
    [all],
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Platform Dashboard"
        description="Is The Platform Healthy? Growth, Usage, And Billing At A Glance."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Workspaces"
          value={t.workspaces}
          icon={Building2}
          hint={`${t.paid} Paid · ${t.pastDue} Past Due`}
        />
        <StatTile label="Leads Stored" value={t.leads} icon={Users} hint="Across Every Workspace" />
        <StatTile
          label="SMS This Month"
          value={t.sentMonth}
          icon={MessageSquare}
          hint="Outbound Segments"
        />
        <StatTile
          label="Active Numbers"
          value={t.numbers}
          icon={Activity}
          hint="Provisioned Sending Numbers"
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="New Workspaces (30d)"
          value={t.new30}
          icon={TrendingUp}
          hint="Signed Up In The Last 30 Days"
        />
        <StatTile
          label="Trial → Paid"
          value={`${conversion}%`}
          icon={TrendingUp}
          hint={`${t.paid} Paid Of ${t.paid + t.trial} Billable`}
        />
        <StatTile
          label="Lifetime SMS"
          value={t.sentAll}
          icon={MessageSquare}
          hint="All Outbound Segments Ever Sent"
        />
      </div>

      {(legacyQ.data?.leads ?? 0) > 0 && (
        <Card className="mb-6 border-warn/40 bg-warn/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <AlertTriangle className="h-4 w-4 text-warn" /> Unverified Legacy Records
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4 text-sm">
            <div className="min-w-[16rem] flex-1 text-muted-foreground">
              {(legacyQ.data?.leads ?? 0).toLocaleString()} leads across{" "}
              {(legacyQ.data?.lists ?? 0).toLocaleString()} lists were created before source
              verification was live. They are already blocked from outreach, export, and the AI
              agent. Purging removes them permanently.
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const res = await runPurge();
                toast.success(`Purged ${res.purged.toLocaleString()} legacy leads`);
                await legacyQ.refetch();
              }}
            >
              Purge Legacy Leads
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-display">Scheduled Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(cronQ.data?.tasks ?? []).length === 0 && (
              <div className="py-4 text-sm text-muted-foreground">Loading Task Health…</div>
            )}
            {(cronQ.data?.tasks ?? []).map((task) => (
              <div
                key={task.key}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {task.consecutiveFailures > 0 ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : task.neverRan ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : task.stale ? (
                    <Clock className="h-4 w-4 shrink-0 text-warn" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{task.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {task.neverRan
                        ? "Never Reached — Check That The Hook Is Deployed"
                        : (task.lastDetail ?? "No Run Recorded Yet")}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge
                    variant="outline"
                    className={
                      task.consecutiveFailures > 0
                        ? "border-destructive/40 text-destructive"
                        : task.neverRan
                          ? "border-destructive/40 text-destructive"
                          : task.stale
                          ? "border-warn/40 text-warn"
                          : "border-border text-muted-foreground"
                    }
                  >
                    {task.consecutiveFailures > 0
                      ? `${task.consecutiveFailures} Failed In A Row`
                      : task.neverRan
                        ? "Never Run"
                        : task.stale
                        ? "No Recent Run"
                        : "Healthy"}
                  </Badge>
                  <span className="w-40 text-right text-[11px] text-muted-foreground">
                    {formatEvery(task.everyMinutes)} ·{" "}
                    {task.lastTickAt ? new Date(task.lastTickAt).toLocaleString() : "Never"}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display">Platform Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <HealthRow label="Paid Workspaces" value={t.paid.toLocaleString()} />
            <HealthRow label="Comped Workspaces" value={t.comped.toLocaleString()} />
            <HealthRow label="Trial Workspaces" value={t.trial.toLocaleString()} />
            <HealthRow
              label="Past Due"
              value={t.pastDue.toLocaleString()}
              tone={t.pastDue > 0 ? "danger" : undefined}
            />
            <HealthRow label="Sending Numbers" value={t.numbers.toLocaleString()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-display">Usage Leaders</CardTitle>
            <Button asChild size="sm" variant="ghost" className="rounded-full text-xs">
              <Link to="/platform/workspaces">
                All Workspaces <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {topUsage.length === 0 && (
              <div className="py-4 text-sm text-muted-foreground">No Usage Recorded Yet.</div>
            )}
            {topUsage.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{w.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {w.owner_email || "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-sm font-bold tabular-nums">
                    {w.stats.sent_month.toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    SMS / Mo
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-display">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 && (
              <div className="py-4 text-sm text-muted-foreground">Nothing Yet.</div>
            )}
            {recent.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{w.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {w.industry ?? "—"} · {w.stats.leads.toLocaleString()} Leads
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant="outline" className={planTone(w.billing_plan ?? "trial")}>
                    {w.billing_plan ?? "trial"}
                  </Badge>
                  <span className="w-20 text-right text-[11px] text-muted-foreground">
                    {w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
