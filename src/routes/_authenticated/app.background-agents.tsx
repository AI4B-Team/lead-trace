/**
 * Settings → Agents. Setup and trust: what each agent is, what mode it runs in,
 * when it last ran, and its own run history. Visited during setup and when
 * something looks off — which is why it is not top-level navigation.
 *
 * Proposals live on the Dashboard, conversation insight lives on Performance,
 * and the full cross-workspace run log lives in /platform.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsShell } from "@/components/app/settings-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { getBackgroundAgents, setAgentMode } from "@/lib/agents/agents.functions";
import {
  AGENT_DEFINITIONS,
  AGENT_GOVERNANCE_NOTE,
  AGENT_MODE_LABEL,
  agentDefinition,
  type AgentMode,
} from "@/lib/agents/registry.shared";

export const Route = createFileRoute("/_authenticated/app/background-agents")({
  head: () => ({
    meta: [
      { title: "Agents — LeadTrace Settings" },
      {
        name: "description",
        content:
          "Configure your LeadTrace background agents: what each one reads, the mode it runs in, when it last ran, and its run history.",
      },
      { property: "og:title", content: "Agents — LeadTrace Settings" },
      {
        property: "og:description",
        content: "Every change an agent wants to make arrives as a proposal a person approves.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentSettingsPage,
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

function AgentSettingsPage() {
  const [openLog, setOpenLog] = useState<string | null>(null);
  const { workspaceId } = useWorkspaceId();
  const fetchAll = useServerFn(getBackgroundAgents);
  const qc = useQueryClient();
  const { data } = useQuery({
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

  const modeOf = (key: string): AgentMode =>
    (data?.agents.find((a) => a.agentKey === key)?.mode as AgentMode) ?? "flag_only";
  const runsFor = (key: string) => (data?.runs ?? []).filter((r) => r.agent_key === key);
  const runStamp = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";

  // "The first week of any agent should be a human reading its output."
  const watchList = AGENT_DEFINITIONS.filter((def) => {
    if (!def.implemented) return false;
    const row = data?.agents.find((a) => a.agentKey === def.key);
    if (!row || row.mode === "off") return false;
    const runs = runsFor(def.key).filter((r) => r.status === "ok");
    const first = runs[runs.length - 1];
    if (!first) return false;
    const days = (Date.now() - new Date(first.started_at).getTime()) / 86_400_000;
    return days < 7;
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current="agents">
        <PageHeader
          title="Agents"
          description="Agents that read your workspace on a schedule, record what they find, and propose changes for you to approve."
        />

        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              <span className="font-display font-bold text-foreground">Nothing Applies Itself.</span>{" "}
              {AGENT_GOVERNANCE_NOTE}
            </p>
          </div>

          {watchList.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                <span className="font-display font-bold text-foreground">In Its First Week.</span>{" "}
                {watchList.map((d) => d.name).join(", ")} — read each run below before you trust the
                pattern. A new agent earns its keep by being checked, not by being left alone.
              </p>
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
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
                          {def.activeCapable && (
                            <SelectItem value="active">{AGENT_MODE_LABEL.active}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {!def.activeCapable && (
                      <p className="text-xs text-muted-foreground">
                        Records What It Finds — A Person Decides What Happens Next.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {def.cadence}
                      </span>
                      <span>Last Run {when(row?.lastRunAt)}</span>
                      {last?.status === "ok" && (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-3 w-3" /> Examined {last.items_examined} ·
                          Recorded {last.items_actioned} · Flagged {last.items_flagged}
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
                    {last?.summary && (
                      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                        {last.summary}
                      </p>
                    )}
                    {runs.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setOpenLog(openLog === def.key ? null : def.key)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          aria-expanded={openLog === def.key}
                        >
                          {openLog === def.key ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          Run History ({runs.length})
                        </button>
                        {openLog === def.key && (
                          <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
                            {runs.map((r) => (
                              <li key={r.id} className="text-xs">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="tabular-nums text-muted-foreground">
                                    {runStamp(r.started_at)}
                                  </span>
                                  {r.status === "ok" ? (
                                    <span className="text-success">
                                      Examined {r.items_examined} · Recorded {r.items_actioned} ·
                                      Flagged {r.items_flagged}
                                    </span>
                                  ) : (
                                    <span className="text-destructive">{r.error ?? r.status}</span>
                                  )}
                                </div>
                                {r.summary && <p className="text-muted-foreground">{r.summary}</p>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-display font-bold">Decisions On Record</h3>
              {(data?.decisions ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No Proposal Has Been Decided Yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {(data?.decisions ?? []).map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center gap-2 border-t border-border pt-2 first:border-0 first:pt-0"
                    >
                      <Badge variant={d.status === "approved" ? "default" : "outline"}>
                        {d.status === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                      <span className="font-medium">
                        {agentDefinition(d.agent_key ?? "")?.name ?? d.agent_key}
                      </span>
                      <span className="text-muted-foreground">
                        {d.proposal_type}
                        {d.target_field ? ` on ${d.target_field}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        by {(data?.reviewers ?? {})[d.reviewed_by ?? ""] ?? "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">{when(d.reviewed_at)}</span>
                      {d.review_note && (
                        <span className="w-full text-xs text-muted-foreground">{d.review_note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </SettingsShell>
    </div>
  );
}
