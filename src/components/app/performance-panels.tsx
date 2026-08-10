import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  Trophy,
  Filter,
  MessageSquare,
  PhoneCall,
  ShieldAlert,
  Snowflake,
  CircleCheck,
  Quote,
  ArrowRight,
  TriangleAlert,
  Lightbulb,
  Check,
  Copy,
} from "lucide-react";
import { INTENT_LABELS, formatMoney, type Intent } from "@/lib/performance-intel";

/** Executive KPI tile with period-over-period movement. */
export function KpiCard({
  label,
  value,
  sub,
  deltaPct,
  invert,
  icon: Icon,
  emphasis,
  emptyHint,
  isEmpty,
}: {
  label: string;
  value: string;
  sub?: string;
  deltaPct?: number | null;
  invert?: boolean;
  icon?: typeof Trophy;
  emphasis?: boolean;
  emptyHint?: string;
  isEmpty?: boolean;
}) {
  const good = deltaPct == null ? null : invert ? deltaPct <= 0 : deltaPct >= 0;
  return (
    <Card className={emphasis ? "border-primary/40 bg-primary/[0.03]" : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />} {label}
        </div>
        <div className="mt-2 font-display text-3xl font-black text-foreground">{value}</div>
        {isEmpty && emptyHint ? (
          <div className="mt-1 text-xs leading-snug text-muted-foreground">{emptyHint}</div>
        ) : deltaPct == null ? (
          <div className="mt-1 text-xs text-muted-foreground">{sub ?? "Not Enough History Yet"}</div>
        ) : (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={`flex items-center gap-0.5 font-semibold ${good ? "text-success" : "text-danger"}`}>
              {deltaPct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(deltaPct)}%
            </span>
            <span className="text-muted-foreground">{sub ?? "vs Previous Period"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Revenue funnel — the hero answer to "is my outreach making money?". */
export function RevenueFunnel({
  steps,
}: {
  steps: Array<{ label: string; value: number; basis?: string; note?: string; empty?: string }>;
}) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {steps.map((s, i) => {
        const prev = steps[i - 1]?.value;
        // Only genuine subsets get a "% of previous" read; sends get msgs/contact.
        const conv =
          s.basis === "subset" && prev
            ? Math.min(Math.round((s.value / Math.max(prev, 1)) * 100), 100)
            : null;
        return (
          <div key={s.label}>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </span>
              <span className="font-display text-2xl font-black text-foreground">
                {s.value.toLocaleString()}
                {conv != null && (
                  <span className="ml-2 align-middle text-xs font-semibold text-muted-foreground">{conv}%</span>
                )}
                {s.note && (
                  <span className="ml-2 align-middle text-xs font-semibold text-muted-foreground">{s.note}</span>
                )}
              </span>
            </div>
            <div className="mt-2 h-5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(Math.max((s.value / top) * 100, s.value ? 3 : 0), 100)}%` }}
              />
            </div>
            {!s.value && s.empty && (
              <div className="mt-1.5 text-xs text-muted-foreground">{s.empty}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function coachTone(text: string): "good" | "warn" | "tip" {
  const t = text.toLowerCase();
  if (t.includes("opt-out") || t.includes("above") || t.includes("cool") || t.includes("low")) return "warn";
  if (t.includes("reuse") || t.includes("try") || t.includes("consider")) return "tip";
  return "good";
}

/** AI Coach — friendly, compact recommendations grounded in real sending history. */
export function AiInsights({
  insights,
}: {
  insights: Array<{ text: string; action?: string; campaignId?: string }>;
}) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display">
          <Sparkles className="h-4 w-4 text-primary" /> AI Coach
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {insights.length === 0 ? (
          <div className="text-sm text-muted-foreground">No Coaching Yet — Send Your First Campaign.</div>
        ) : (
          insights.slice(0, 4).map((i) => {
            const tone = coachTone(i.text);
            const Icon = tone === "warn" ? TriangleAlert : tone === "tip" ? Lightbulb : Check;
            const color = tone === "warn" ? "text-warn" : tone === "tip" ? "text-primary" : "text-success";
            return (
              <div key={i.text} className="flex items-start gap-2 rounded-lg bg-surface-muted/60 px-3 py-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
                <div className="min-w-0">
                  <div className="text-[13px] leading-snug text-foreground">{i.text}</div>
                  {i.action && i.campaignId && (
                    <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                      <Link to="/app/campaigns/$campaignId" params={{ campaignId: i.campaignId }}>
                        {i.action} <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/** Week-over-week movement digest — the summary users scan first. */
export function WeeklySummary({
  rows,
  bestCampaign,
}: {
  rows: Array<{ label: string; deltaPct: number | null; invert?: boolean }>;
  bestCampaign?: { id: string; name: string } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        This Week
      </span>
      {rows.map((r) => {
        const good = r.deltaPct == null ? null : r.invert ? r.deltaPct <= 0 : r.deltaPct >= 0;
        return (
          <span key={r.label} className="flex items-baseline gap-1.5 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`font-display font-bold ${good == null ? "text-muted-foreground" : good ? "text-success" : "text-danger"}`}>
              {r.deltaPct == null ? "—" : `${r.deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(r.deltaPct)}%`}
            </span>
          </span>
        );
      })}
      {bestCampaign && (
        <span className="flex items-baseline gap-1.5 text-sm">
          <span className="text-muted-foreground">Best Campaign</span>
          <Link
            to="/app/campaigns/$campaignId"
            params={{ campaignId: bestCampaign.id }}
            className="font-display font-bold text-foreground hover:text-primary"
          >
            {bestCampaign.name}
          </Link>
        </span>
      )}
    </div>
  );
}

const SERIES = [
  { id: "sent", label: "Messages", color: "hsl(var(--primary))" },
  { id: "replies", label: "Replies", color: "hsl(var(--warn))" },
  { id: "conversations", label: "Conversations", color: "hsl(var(--success))" },
  { id: "appointments", label: "Appointments", color: "hsl(var(--primary))" },
  { id: "revenue", label: "Pipeline", color: "hsl(var(--success))" },
] as const;

type SeriesId = (typeof SERIES)[number]["id"];

/** One chart, five lenses — the same day viewed as volume or revenue. */
export function PerformanceChart({
  daily,
}: {
  daily: Array<{ day: string; sent: number; delivered: number; replies: number; optOuts: number; conversations: number; qualified: number; appointments: number; revenue: number }>;
}) {
  const [series, setSeries] = useState<SeriesId>("replies");
  const active = SERIES.find((s) => s.id === series)!;
  const activeDays = daily.filter((d) => d.sent > 0 || d.replies > 0).length;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base font-display">Performance Trend</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={s.id === series ? "default" : "outline"}
              className="rounded-full h-7 text-xs"
              onClick={() => setSeries(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {activeDays > 0 && activeDays < 4 && (
          <div className="mb-2 text-xs text-muted-foreground">
            Early Days — Only {activeDays} Day{activeDays === 1 ? "" : "s"} Of Activity So Far. The Trend Fills In As You Keep Sending.
          </div>
        )}
        {activeDays === 0 && (
          <div className="mb-2 text-xs text-muted-foreground">
            No Sending Activity In This Window Yet — Launch A Campaign To Start The Trend.
          </div>
        )}
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="perfG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={active.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={active.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<DayTooltip />} />
              <Area
                type="monotone"
                dataKey={series}
                stroke={active.color}
                strokeWidth={2}
                fill="url(#perfG)"
                name={active.label}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/** Rich hover card: every metric for that day, not just the active series. */
function DayTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: Record<string, number> }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  const rows: Array<[string, string]> = [
    ["Messages", Number(d['sent'] ?? 0).toLocaleString()],
    ["Delivered", Number(d['delivered'] ?? 0).toLocaleString()],
    ["Replies", Number(d['replies'] ?? 0).toLocaleString()],
    ["Conversations", Number(d['conversations'] ?? 0).toLocaleString()],
    ["Appointments", Number(d['appointments'] ?? 0).toLocaleString()],
    ["Opt-Outs", Number(d['optOuts'] ?? 0).toLocaleString()],
    ["Pipeline", formatMoney(Number(d['revenue'] ?? 0))],
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-lg">
      <div className="font-display font-bold text-sm text-foreground mb-1.5">{String(label ?? "")}</div>
      <div className="space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-6 text-xs">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-semibold text-foreground">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Campaign performance — Stripe-style rows that never reserve empty space. */
export function CampaignLeaderboard({
  campaigns,
}: {
  campaigns: Array<{ id: string; name: string; status: string; sent: number; replies: number; appointments: number; qualified: number; replyRate: number; optOutRate: number }>;
}) {
  if (campaigns.length === 0) {
    return <div className="text-sm text-muted-foreground">No Campaign Activity Yet.</div>;
  }
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {campaigns.map((c) => (
        <Link
          key={c.id}
          to="/app/campaigns/$campaignId"
          params={{ campaignId: c.id }}
          className="flex flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 transition hover:bg-surface-muted/60"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold text-foreground">{c.name}</div>
            <Badge variant="outline" className="mt-0.5 text-[10px] uppercase">{c.status}</Badge>
          </div>
          <RowStat label="Reply Rate" value={`${(c.replyRate * 100).toFixed(0)}%`} />
          <RowStat label="Appointments" value={String(c.appointments)} />
          <RowStat label="Pipeline" value={formatMoney(c.appointments * 2000 * 0.22)} />
          <RowStat
            label="Opt-Out"
            value={`${(c.optOutRate * 100).toFixed(1)}%`}
            tone={c.optOutRate > 0.05 ? "danger" : undefined}
          />
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function RowStat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="w-24 shrink-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-sm font-bold ${tone === "danger" ? "text-danger" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

/** Number health grid with reputation buckets and rotation status. */
export function NumberHealthPanel({
  data,
}: {
  data: {
    rows: Array<{ id: string; phone: string; status: string | null; health_score: number | null; optout_rate: number | null }>;
    healthy: number;
    cooling: number;
    flagged: number;
    avgReputation: number;
    rotation: boolean;
  };
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-primary" /> Number Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <HealthTile icon={CircleCheck} label="Healthy" value={String(data.healthy)} tone="success" />
          <HealthTile icon={Snowflake} label="Cooling" value={String(data.cooling)} tone="warn" />
          <HealthTile icon={ShieldAlert} label="Flagged" value={String(data.flagged)} tone="danger" />
          <HealthTile label="Avg Reputation" value={`${data.avgReputation}%`} />
          <HealthTile label="Rotation" value={data.rotation ? "Active" : "Single"} tone={data.rotation ? "success" : undefined} />
        </div>
        {data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <div className="font-display font-bold text-foreground">No Sending Numbers Yet</div>
            <div className="text-sm text-muted-foreground mt-1">
              No Active Sending Number — Replies Cannot Be Delivered Yet. Add One To Start Rotating Traffic And Building
              Carrier Reputation.
            </div>
            <Button asChild size="sm" className="rounded-full mt-3">
              <Link to="/app/numbers">Get A Number</Link>
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.rows.map((n) => {
              const score = Number(n.health_score ?? 0);
              const tone = score >= 80 ? "bg-success" : score >= 50 ? "bg-warn" : "bg-danger";
              return (
                <div key={n.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-foreground">{n.phone}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden />
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                    <div className={`h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="uppercase">{n.status ?? "active"}</span>
                    <span>{score}% · {((n.optout_rate ?? 0) * 100).toFixed(1)}% Opt-Out</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon?: typeof CircleCheck;
  label: string;
  value: string;
  tone?: "success" | "warn" | "danger";
}) {
  const color = tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className={`mt-1 font-display text-xl font-black ${color}`}>{value}</div>
    </div>
  );
}

/** Winning copy so operators can clone what already works. */
export function BestMessagePanel({
  best,
}: {
  best: { body: string; sent: number; replies: number; replyRate: number; campaigns: number } | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display">
          <Quote className="h-4 w-4 text-primary" /> Top Performing Message
        </CardTitle>
        {best && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-xs"
            onClick={() => void navigator.clipboard.writeText(best.body)}
          >
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
        )}
      </CardHeader>
      <CardContent className="pb-4">
        {!best ? (
          <div className="text-sm text-muted-foreground">No Outbound Copy To Score Yet.</div>
        ) : (
          <>
            <div className="rounded-2xl rounded-bl-sm bg-primary px-4 py-2.5 text-[13px] leading-snug text-primary-foreground">
              {best.body}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              <MiniStat label="Reply Rate" value={`${(best.replyRate * 100).toFixed(0)}%`} />
              <MiniStat label="Times Sent" value={best.sent.toLocaleString()} />
              <MiniStat label="Used In" value={`${best.campaigns} Campaign${best.campaigns === 1 ? "" : "s"}`} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

const INTENT_TONE: Record<string, string> = {
  appointment: "border-success/40 text-success",
  qualified: "border-success/40 text-success",
  question: "border-primary/40 text-primary",
  negative: "border-warn/40 text-warn",
  optout: "border-danger/40 text-danger",
  neutral: "border-border text-muted-foreground",
};

/** Live conversation feed keeps the page feeling alive. */
export function RecentConversations({
  recent,
}: {
  recent: Array<{ id: string; name: string; place: string; body: string; intent: string; at: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Latest Conversations
        </CardTitle>
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
          <Link to="/app/inbox">Open Conversations <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No Inbound Replies Yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((r) => (
              <div key={r.id} className="py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">{r.name}</span>
                    <Badge variant="outline" className={`rounded-full text-[10px] ${INTENT_TONE[r.intent] ?? ""}`}>
                      {INTENT_LABELS[r.intent as Intent] ?? "Replied"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.body}</div>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{ago(r.at)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins} Min Ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} Hr Ago`;
  return `${Math.round(hrs / 24)} Days Ago`;
}
