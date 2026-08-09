/**
 * Platform: the full background-agent run log across every workspace. This is a
 * debug surface — it belongs to whoever is diagnosing an agent, not to the
 * operator whose work it describes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPlatformAgentRuns } from "@/lib/agents/agents.functions";
import { agentDefinition } from "@/lib/agents/registry.shared";

export const Route = createFileRoute("/_authenticated/platform/agents")({
  head: () => ({
    meta: [
      { title: "Agent Runs — LeadTrace Platform" },
      {
        name: "description",
        content:
          "Every background agent run across every workspace: what it examined, what it recorded, and how it failed.",
      },
      { property: "og:title", content: "Agent Runs — LeadTrace Platform" },
      {
        property: "og:description",
        content: "Cross-workspace background agent run log for diagnosing agent behaviour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformAgentRuns,
});

function stamp(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PlatformAgentRuns() {
  const [q, setQ] = useState("");
  const fetchRuns = useServerFn(getPlatformAgentRuns);
  const { data, isLoading } = useQuery({
    queryKey: ["platform-agent-runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 60_000,
  });

  const names = data?.workspaces ?? {};
  const runs = (data?.runs ?? []).filter((r) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return [
      r.agent_key,
      r.status,
      r.summary ?? "",
      r.error ?? "",
      names[r.workspace_id ?? ""] ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agent Runs"
        description="Every background agent run across every workspace, newest first. Failures keep their exact error."
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter By Agent, Workspace, Status Or Error"
            className="max-w-md"
          />
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Runs…
            </div>
          ) : runs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No Runs Match.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Examined</TableHead>
                    <TableHead>Recorded</TableHead>
                    <TableHead>Flagged</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {agentDefinition(r.agent_key ?? "")?.name ?? r.agent_key}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {names[r.workspace_id ?? ""] ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{stamp(r.started_at)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "failed" ? "destructive" : "outline"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{r.items_examined}</TableCell>
                      <TableCell className="tabular-nums">{r.items_actioned}</TableCell>
                      <TableCell className="tabular-nums">{r.items_flagged}</TableCell>
                      <TableCell className="max-w-[28rem] text-muted-foreground">
                        {r.error ?? r.summary ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
