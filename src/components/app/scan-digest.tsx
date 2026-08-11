import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Loader2, RefreshCw, Repeat } from "lucide-react";
import { toast } from "sonner";
import { getScanDigest, markWorkspaceVisited, queueDueScans } from "@/lib/monitoring.functions";
import { runJob } from "@/lib/pipeline.functions";
import { CADENCE_LABEL, recordTypeLabelFor } from "@/lib/monitoring.shared";

/**
 * "Since your last visit" digest (spec §15.1). Reports only what the system
 * actually did — new records per recurring job, nothing predictive.
 */
export function ScanDigest({ workspaceId }: { workspaceId: string | null }) {
  const fetchDigest = useServerFn(getScanDigest);
  const markVisited = useServerFn(markWorkspaceVisited);
  const queueDue = useServerFn(queueDueScans);
  const run = useServerFn(runJob);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data } = useQuery({
    queryKey: ["scan-digest", workspaceId],
    queryFn: () => fetchDigest({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  // Stamp the visit once the digest for this window has been shown.
  useEffect(() => {
    if (!workspaceId || !data) return;
    const t = setTimeout(() => {
      markVisited({ data: { workspaceId } }).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, [workspaceId, data, markVisited]);

  if (!workspaceId || !data || data.recurring.length === 0) return null;

  const dueCount = data.recurring.filter((j) => j.due).length;
  const types = Object.entries(data.byRecordType);

  const runDue = async () => {
    setRunning(true);
    try {
      const { queued } = await queueDue({ data: { workspaceId } });
      if (!queued.length) {
        toast.success("Nothing Due Right Now.");
        return;
      }
      for (const jobId of queued) await run({ data: { jobId } });
      toast.success(`${queued.length} Recurring ${queued.length === 1 ? "Scan" : "Scans"} Re-Ran.`);
      qc.invalidateQueries({ queryKey: ["scan-digest", workspaceId] });
      qc.invalidateQueries({ queryKey: ["jobs-list", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Run Scans.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-display">Since Your Last Visit</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {data.newRecords.toLocaleString()} New {data.newRecords === 1 ? "Record" : "Records"} Across{" "}
            {data.recurring.length} Recurring {data.recurring.length === 1 ? "List" : "Lists"}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dueCount > 0 && (
            <Button size="sm" className="rounded-full" onClick={runDue} disabled={running}>
              {running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Run {dueCount} Due
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link to="/app/leads" search={{ onlyNew: true }}>
              View New Records <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {data.recurring.map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link
                  to="/app/lists/$listId"
                  params={{ listId: j.id }}
                  className="font-medium text-foreground hover:text-primary truncate block"
                >
                  {j.name}
                </Link>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <Repeat className="h-3 w-3" />
                  {CADENCE_LABEL[j.schedule] ?? j.schedule}
                  {j.next_run_at && <span>· Next {new Date(j.next_run_at).toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {j.due && <Badge variant="outline" className="text-warn border-warn/30">Due</Badge>}
                <span className={`text-sm font-medium ${j.newRecords ? "text-primary" : "text-muted-foreground"}`}>
                  +{j.newRecords.toLocaleString()} New
                </span>
              </div>
            </div>
          ))}
        </div>
        {types.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {types.map(([t, n]) => (
              <Badge key={t} variant="secondary" className="font-normal">
                {recordTypeLabelFor(t)} · {n.toLocaleString()}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
