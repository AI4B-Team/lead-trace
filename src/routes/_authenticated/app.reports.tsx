import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Handshake, CalendarCheck, DollarSign, Reply } from "lucide-react";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { getWorkspacePerformance } from "@/lib/reports.functions";
import { getConversationInsight } from "@/lib/agents/agents.functions";
import { ConversationsReport, type OutcomeRow } from "@/components/app/conversations-report";
import { formatMoney } from "@/lib/performance-intel";
import {
  KpiCard,
  RevenueFunnel,
  AiInsights,
  PerformanceChart,
  CampaignLeaderboard,
  BestMessagePanel,
  WeeklySummary,
} from "@/components/app/performance-panels";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({
    meta: [
      { title: "Performance — LeadTrace" },
      { name: "description", content: "Conversations, qualified leads, appointments and projected pipeline across your workspace." },
    ],
  }),
  component: Performance,
});

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function Performance() {
  const { workspaceId } = useWorkspaceId();
  const fetchPerf = useServerFn(getWorkspacePerformance);
  const fetchInsight = useServerFn(getConversationInsight);
  const { data, isLoading } = useQuery({
    queryKey: ["workspace-performance", workspaceId],
    queryFn: () => fetchPerf({ data: { workspaceId: workspaceId!, days: 30 } }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });
  const { data: insight } = useQuery({
    queryKey: ["conversation-insight", workspaceId],
    queryFn: () => fetchInsight({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Performance…
      </div>
    );
  }

  const { kpis, deltas, daily, funnel, campaigns, bestMessage, insights, timing, historyReady, byNumber, variants } = data;

  const week = weekOverWeek(daily);
  const bestCampaign = campaigns[0] ? { id: campaigns[0].id, name: campaigns[0].name } : null;

  return (
    <div>
      <PageHeader
        title="Performance"
        description="Is Your Outreach Making You Money? Appointments, Pipeline And What To Do Next."
      />

      {/* Results — hero KPIs, weekly digest and the revenue funnel in one group */}
      <Card className="mb-6">
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiCard
              label="Qualified Leads"
              value={kpis.qualified.toLocaleString()}
              deltaPct={deltas.qualified}
              icon={Handshake}
            />
            <KpiCard
              label="Appointments"
              value={kpis.appointments.toLocaleString()}
              deltaPct={deltas.appointments}
              icon={CalendarCheck}
              isEmpty={kpis.appointments === 0}
              emptyHint="No Appointments Booked Yet — They Appear Here Once Leads Schedule."
            />
            <KpiCard
              label="Reply Rate"
              value={pct(kpis.replyRate)}
              deltaPct={deltas.replyRate}
              icon={Reply}
              isEmpty={kpis.sent === 0}
              emptyHint="Reply Rate Starts Once Your First Messages Go Out."
            />
            <KpiCard
              label="Pipeline Value"
              value={formatMoney(kpis.pipeline)}
              deltaPct={deltas.pipeline}
              icon={DollarSign}
              emphasis
              isEmpty={kpis.pipeline === 0}
              emptyHint="Pipeline Value Builds As Qualified Leads Convert To Appointments."
            />
          </div>

          <div className="border-t border-border pt-4">
            {week.ready ? (
              <WeeklySummary
                rows={[
                  { label: "Replies", deltaPct: week.replies },
                  { label: "Qualified", deltaPct: week.qualified },
                  { label: "Appointments", deltaPct: week.appointments },
                  { label: "Opt-Outs", deltaPct: week.optOuts, invert: true },
                ]}
                bestCampaign={bestCampaign}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 text-sm">
                <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  This Week
                </span>
                <span className="text-muted-foreground">
                  Not Enough History Yet — Week-Over-Week Movement Appears After Two Weeks Of Sending.
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-6">
            <div className="mb-5 text-center">
              <h2 className="font-display text-lg font-black text-foreground">Revenue Funnel</h2>
              <p className="text-xs text-muted-foreground">Last 30 Days · Where Leads Turn Into Revenue</p>
            </div>
            <RevenueFunnel steps={funnel} />
          </div>
        </CardContent>
      </Card>

      {/* Supporting analytics */}
      <Card className="mb-6">
        <CardContent className="space-y-5 pt-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Secondary label="Messages Sent (30d)" value={kpis.sent.toLocaleString()} deltaPct={deltas.sent} />
            <Secondary label="Delivery Rate" value={pct(kpis.deliverRate)} deltaPct={deltas.deliverRate} tone="success" />
            <Secondary label="AI Conversations" value={kpis.conversations.toLocaleString()} deltaPct={deltas.conversations} />
            <Secondary
              label="Opt-Out Rate"
              value={pct(kpis.optOutRate)}
              deltaPct={deltas.optOutRate}
              invert
              tone={kpis.optOutRate > 0.05 ? "danger" : undefined}
            />
            <Secondary label="Most Responsive Time" value={kpis.replies ? timing.bestBand ?? "—" : "—"} />
            <Secondary label="Best Send Day" value={kpis.replies ? timing.bestDay ?? "—" : "—"} />
          </div>
          {!historyReady && (
            <p className="text-xs text-muted-foreground">
              Comparisons Are Hidden Until The Prior Period Has Enough Sending History To Measure Against.
            </p>
          )}
          <div className="border-t border-border pt-2">
            <PerformanceChart daily={daily} />
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <AiInsights insights={insights} />
        <BestMessagePanel best={bestMessage} />
      </div>

      <div className="mb-6">
        <ConversationsReport outcomes={(insight?.outcomes ?? []) as OutcomeRow[]} />
      </div>

      <div>
        <h2 className="mb-3 font-display text-base font-black text-foreground">Campaign Performance</h2>
        <CampaignLeaderboard campaigns={campaigns} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <NumberDeliverability rows={byNumber} />
        <VariantTable rows={variants} />
      </div>
    </div>
  );
}

/**
 * Per-number deliverability: rotation is only safe when you can see which DID
 * is carrying the sends and which one is absorbing the opt-outs.
 */
function NumberDeliverability({
  rows,
}: {
  rows: Array<{ id: string; phone: string; status: string; health: number; sent: number; delivered: number; replies: number; optOuts: number; deliverRate: number; replyRate: number; optOutRate: number }>;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-1 font-display text-base font-black text-foreground">Deliverability By Number</h2>
        <p className="mb-3 text-xs text-muted-foreground">Last 30 Days · Sends, Delivery, Replies And Opt-Outs Per Sending Number</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Number Has Sent Yet — Per-Number Deliverability Appears After Your First Campaign Sends.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Sent</th>
                  <th className="py-2 pr-3">Delivered</th>
                  <th className="py-2 pr-3">Replies</th>
                  <th className="py-2 pr-3">Opt-Outs</th>
                  <th className="py-2">Health</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {n.phone}
                      {n.status === "cooling" && <span className="ml-2 text-[11px] text-warn">Cooling</span>}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{n.sent.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-success">{pct(n.deliverRate)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{pct(n.replyRate)}</td>
                    <td className={`py-2 pr-3 ${n.optOutRate > 0.05 ? "text-danger" : "text-muted-foreground"}`}>{pct(n.optOutRate)}</td>
                    <td className="py-2 text-muted-foreground">{n.health}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A/B copy comparison: every distinct opener is a variant, ranked by volume. */
function VariantTable({
  rows,
}: {
  rows: Array<{ body: string; sent: number; replies: number; replyRate: number; campaigns: number }>;
}) {
  const best = rows.reduce((acc, r) => (r.sent >= 10 && r.replyRate > acc ? r.replyRate : acc), 0);
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-1 font-display text-base font-black text-foreground">Message Variants</h2>
        <p className="mb-3 text-xs text-muted-foreground">Last 30 Days · Reply Rate By Opener, So You Can Retire The Losers</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Outbound Copy Yet — Variant Comparison Appears Once Messages Go Out.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((v, i) => (
              <div key={i} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <p className="line-clamp-2 text-sm text-foreground">{v.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {v.sent.toLocaleString()} Sent · {v.replies.toLocaleString()} Replies ·{" "}
                  <span className={best > 0 && v.replyRate === best ? "font-semibold text-success" : ""}>{pct(v.replyRate)} Reply Rate</span>
                  {v.sent < 10 && <span> · Early Signal</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Last 7 days vs the 7 before, straight from the daily series. */
function weekOverWeek(
  daily: Array<{ replies: number; qualified: number; appointments: number; optOuts: number }>,
) {
  const last = daily.slice(-7);
  const prior = daily.slice(-14, -7);
  const sum = (rows: typeof last, key: "replies" | "qualified" | "appointments" | "optOuts") =>
    rows.reduce((a, r) => a + (r[key] ?? 0), 0);
  const move = (key: "replies" | "qualified" | "appointments" | "optOuts") => {
    const a = sum(last, key);
    const b = sum(prior, key);
    if (!b) return null;
    return Math.round(((a - b) / b) * 100);
  };
  return {
    // Movement only means something when the prior week actually had activity.
    ready: sum(prior, "replies") + sum(prior, "qualified") + sum(prior, "appointments") >= 3,
    replies: move("replies"),
    qualified: move("qualified"),
    appointments: move("appointments"),
    optOuts: move("optOuts"),
  };
}

/** Compact operational metric with movement, secondary to the executive row. */
function Secondary({
  label,
  value,
  deltaPct,
  tone,
  invert,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  tone?: "success" | "danger";
  invert?: boolean;
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  const good = deltaPct == null ? null : invert ? deltaPct <= 0 : deltaPct >= 0;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-xl font-black ${color}`}>{value}</div>
      {deltaPct != null && (
        <div className={`text-[11px] font-semibold ${good ? "text-success" : "text-danger"}`}>
          {deltaPct >= 0 ? "↑" : "↓"} {Math.abs(deltaPct)}% vs Prior
        </div>
      )}
    </div>
  );
}
