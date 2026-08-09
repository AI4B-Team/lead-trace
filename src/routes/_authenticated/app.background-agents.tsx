import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaceId } from "@/hooks/use-workspace";
import {
  getBackgroundAgents,
  reviewAgentProposal,
  setAgentMode,
} from "@/lib/agents/agents.functions";
import {
  AGENT_DEFINITIONS,
  AGENT_GOVERNANCE_NOTE,
  AGENT_MODE_LABEL,
  agentDefinition,
  type AgentMode,
} from "@/lib/agents/registry.shared";
import {
  OUTCOME_LABEL,
  SENTIMENT_LABEL,
  objectionLabel,
  type Outcome,
  type Sentiment,
} from "@/lib/agents/labeler.shared";
import { AlertTriangle, Bot, CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/background-agents")({
  head: () => ({
    meta: [
      { title: "Background Agents — LeadTrace" },
      {
        name: "description",
        content:
          "See what your LeadTrace background agents examined, what they flagged, and approve every change they propose before it takes effect.",
      },
      { property: "og:title", content: "Background Agents — LeadTrace" },
      {
        property: "og:description",
        content: "Every change an agent wants to make arrives as a proposal a person approves.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BackgroundAgentsPage,
});

function when(iso?: string | null) {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just Now";
  if (mins < 60) return `${mins} Min Ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} Hr${hours === 1 ? "" : "s"} Ago`;
  return `${Math.round(hours / 24)} Days Ago`;
}

type Outcomes = Array<{
  outcome: string;
  objection_category: string | null;
  sentiment: string | null;
  touches_before_outcome: number | null;
  flagged: boolean;
}>;

function ConversationsReport({ outcomes }: { outcomes: Outcomes }) {
  if (outcomes.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No Conversations Labeled Yet. The Labeler Reads A Conversation Once It Has Finished — Idle
          For Three Days, Opted Out, Or Closed By Its Sequence.
        </CardContent>
      </Card>
    );
  }
  const byOutcome = new Map<string, number>();
  const byObjection = new Map<string, number>();
  const bySentiment = new Map<string, number>();
  let touchSum = 0;
  let touchCount = 0;
  let flagged = 0;
  for (const o of outcomes) {
    byOutcome.set(o.outcome, (byOutcome.get(o.outcome) ?? 0) + 1);
    if (o.objection_category)
      byObjection.set(o.objection_category, (byObjection.get(o.objection_category) ?? 0) + 1);
    if (o.sentiment) bySentiment.set(o.sentiment, (bySentiment.get(o.sentiment) ?? 0) + 1);
    if (typeof o.touches_before_outcome === "number") {
      touchSum += o.touches_before_outcome;
      touchCount += 1;
    }
    if (o.flagged) flagged += 1;
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const total = outcomes.length;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display font-bold">What Happened In Your Conversations</h3>
            <span className="text-xs text-muted-foreground">{total} Labeled</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {sorted(byOutcome).map(([key, count]) => (
              <li key={key} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 text-muted-foreground">
                  {OUTCOME_LABEL[key as Outcome] ?? key}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (count / total) * 100)}%` }}
                  />
                </div>
                <span className="w-16 text-right tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="space-y-3">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-display font-bold">Objections, By Name</h3>
            {byObjection.size === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None Recorded Yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {sorted(byObjection)
                  .slice(0, 6)
                  .map(([key, count]) => (
                    <li key={key} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{objectionLabel(key)}</span>
                      <span className="tabular-nums">{count}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average Touches Before Outcome</span>
              <span className="tabular-nums">
                {touchCount ? (touchSum / touchCount).toFixed(1) : "—"}
              </span>
            </div>
            {sorted(bySentiment).map(([key, count]) => (
              <div key={key} className="flex justify-between">
                <span className="text-muted-foreground">
                  {SENTIMENT_LABEL[key as Sentiment] ?? key}
                </span>
                <span className="tabular-nums">{count}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1.5">
              <span className="text-muted-foreground">Flagged For A Human</span>
              <span className="tabular-nums">{flagged}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BackgroundAgentsPage() {
  const { workspaceId } = useWorkspaceId();
  const fetchAll = useServerFn(getBackgroundAgents);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["background-agents", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchAll({ data: { workspaceId: workspaceId! } }),
  });

  const changeMode = useMutation({
    mutationFn: useServerFn(setAgentMode),
    onSuccess: () => {
      toast.success("Agent Updated");
      qc.invalidateQueries({ queryKey: ["background-agents", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const review = useMutation({
    mutationFn: useServerFn(reviewAgentProposal),
    onSuccess: () => {
      toast.success("Decision Recorded");
      qc.invalidateQueries({ queryKey: ["background-agents", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modeOf = (key: string): AgentMode =>
    (data?.agents.find((a) => a.agentKey === key)?.mode as AgentMode) ?? "flag_only";
  const runsFor = (key: string) => (data?.runs ?? []).filter((r) => r.agent_key === key);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Background Agents"
        description="Agents that read your workspace on a schedule, record what they find, and propose changes for you to approve."
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          <span className="font-display font-bold text-foreground">Nothing Applies Itself.</span>{" "}
          {AGENT_GOVERNANCE_NOTE}
        </p>
      </div>

      <ConversationsReport outcomes={(data?.outcomes ?? []) as Outcomes} />

      <div className="grid gap-3 md:grid-cols-2">
        {AGENT_DEFINITIONS.map((def) => {
          const row = data?.agents.find((a) => a.agentKey === def.key);
          const runs = runsFor(def.key);
          const last = runs[0];
          return (
            <Card key={def.key}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <h3 className="font-display font-bold">{def.name}</h3>
                      {!def.implemented && <Badge variant="outline">Not Live Yet</Badge>}
                      {def.proposalsOnly && <Badge variant="secondary">Proposes Only</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
                  </div>
                  <Select
                    value={modeOf(def.key)}
                    onValueChange={(mode) =>
                      workspaceId &&
                      changeMode.mutate({
                        data: { workspaceId, agentKey: def.key, mode: mode as AgentMode },
                      })
                    }
                  >
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">{AGENT_MODE_LABEL.off}</SelectItem>
                      <SelectItem value="flag_only">{AGENT_MODE_LABEL.flag_only}</SelectItem>
                      {!def.proposalsOnly && (
                        <SelectItem value="active">{AGENT_MODE_LABEL.active}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {def.cadence}
                  </span>
                  <span>Last Run {when(row?.lastRunAt)}</span>
                  {last?.status === "ok" && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" /> Examined {last.items_examined} · Recorded{" "}
                      {last.items_actioned} · Flagged {last.items_flagged}
                    </span>
                  )}
                  {last?.status === "failed" && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {last.error ?? "Failed"}
                    </span>
                  )}
                  {(row?.consecutiveFailures ?? 0) >= 3 && (
                    <span className="text-destructive">
                      Paused After 3 Failures — Set A Mode To Resume
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-display font-bold">Proposals Waiting On You</h3>
          {(data?.proposals ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {isLoading ? "Loading…" : "Nothing Pending. Agents Propose Only When They Have Evidence."}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {(data?.proposals ?? []).map((p) => (
                <li key={p.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">
                      {agentDefinition(p.agent_key ?? "")?.name ?? p.agent_key}
                    </Badge>
                    <span className="font-semibold">
                      {p.proposal_type === "lead_nomination"
                        ? "Worth A Touch Today"
                        : p.proposal_type === "scorer_weights"
                          ? "Updated Lead Weighting"
                          : p.proposal_type === "bot_copy_edit"
                            ? (p.proposed_value as { title?: string } | null)?.title ?? "Wording Change"
                            : p.proposal_type === "booking_review"
                              ? "Check This Booking Before Anyone Drives"
                              : p.proposal_type}
                    </span>
                    {p.proposal_type === "lead_nomination" &&
                      typeof (p.proposed_value as { score?: number } | null)?.score === "number" && (
                        <Badge variant="secondary">
                          Score {(p.proposed_value as { score: number }).score}
                        </Badge>
                      )}
                    {p.target_field && (
                      <span className="text-muted-foreground">on {p.target_field}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{p.rationale}</p>
                  {p.proposal_type === "booking_review" && (
                    <div className="mt-2 rounded-lg border border-border p-2.5 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {((p.proposed_value as { issues?: BookingIssue[] } | null)?.issues ?? []).map((issue) => (
                          <Badge key={issue} variant="destructive">
                            {BOOKING_ISSUE_LABEL[issue] ?? issue}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-1.5 text-muted-foreground">
                        Lead Said: {(p.proposed_value as { lead_time?: string | null } | null)?.lead_time ?? "No Time"}
                        {" · "}
                        Your Side Said:{" "}
                        {(p.proposed_value as { bot_time?: string | null } | null)?.bot_time ?? "No Time"}
                      </div>
                      <p className="mt-1.5 text-muted-foreground">
                        Nothing Was Changed. The Thread Still Reads As An Appointment Until You Decide.
                      </p>
                    </div>
                  )}
                  {(p.proposed_value as { captured?: { trigger?: string; approved_response?: string } } | null)
                    ?.captured?.approved_response && (
                    <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2.5 text-xs">
                      <div>
                        <span className="font-medium text-foreground">They Asked:</span>{" "}
                        <span className="text-muted-foreground">
                          {(p.proposed_value as { captured: { trigger?: string } }).captured.trigger}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Your Team Answered:</span>{" "}
                        <span className="text-muted-foreground">
                          {(p.proposed_value as { captured: { approved_response?: string } }).captured
                            .approved_response}
                        </span>
                      </div>
                    </div>
                  )}
                  {p.proposal_type === "bot_copy_edit" && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
                      <div className="font-medium text-foreground">
                        {(p.proposed_value as { profile_name?: string } | null)?.profile_name ?? "Bot Profile"} —
                        {" "}
                        Read The Exact Wording Before You Approve
                      </div>
                      <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap text-muted-foreground">
                        {JSON.stringify((p.proposed_value as { value?: unknown } | null)?.value, null, 2)}
                      </pre>
                      <p className="mt-1.5 text-muted-foreground">
                        Approving Records A New Version Of This Profile Under Your Name.
                      </p>
                    </div>
                  )}
                  {p.proposal_type === "scorer_weights" &&
                    Array.isArray((p.proposed_value as { changes?: unknown } | null)?.changes) && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {(
                          (p.proposed_value as {
                            changes: Array<{ label: string; from: number; to: number; samples: number }>;
                          }).changes
                        ).map((c) => (
                          <li key={c.label} className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{c.label}</span>
                            <span>
                              {c.from} → {c.to}
                            </span>
                            <span>from {c.samples} conversations</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        workspaceId &&
                        review.mutate({
                          data: { workspaceId, proposalId: p.id, decision: "approved" },
                        })
                      }
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        workspaceId &&
                        review.mutate({
                          data: { workspaceId, proposalId: p.id, decision: "rejected" },
                        })
                      }
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-display font-bold">Recent Runs</h3>
          {(data?.runs ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No Runs Recorded Yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-4">Agent</th>
                    <th className="py-1 pr-4">Started</th>
                    <th className="py-1 pr-4">Status</th>
                    <th className="py-1">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.runs ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5 pr-4">
                        {agentDefinition(r.agent_key ?? "")?.name ?? r.agent_key}
                      </td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{when(r.started_at)}</td>
                      <td className="py-1.5 pr-4">{r.status}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {r.error ?? r.summary ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}