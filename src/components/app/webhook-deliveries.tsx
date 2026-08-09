import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History as HistoryIcon } from "lucide-react";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { listWebhookDeliveries } from "@/lib/monitoring.functions";

const COLUMNS = ["Event", "Endpoint", "Status", "Response Code", "Timestamp"];

/** Delivery history for outbound webhooks — written by the event dispatcher. */
export function WebhookDeliveries() {
  const { workspaceId } = useWorkspaceId();
  const fetchDeliveries = useServerFn(listWebhookDeliveries);

  const { data } = useQuery({
    queryKey: ["webhook-deliveries", workspaceId],
    queryFn: () => fetchDeliveries({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-display">
          <HistoryIcon className="h-4 w-4 text-muted-foreground" /> Recent Deliveries
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {COLUMNS.map((c) => (
                  <th key={c} className="pb-2 pr-4 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-6 text-center text-muted-foreground">
                    No deliveries yet. Add an endpoint to start receiving events.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-medium text-foreground">{r.event_type}</td>
                    <td className="py-2 pr-4 max-w-[220px] truncate text-muted-foreground" title={r.url}>
                      {r.url}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={r.ok ? "secondary" : "destructive"} className="text-[10px]">
                        {r.ok ? "Delivered" : "Failed"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {r.status_code ?? "—"}
                      {r.duration_ms != null ? ` · ${r.duration_ms}ms` : ""}
                      {r.error ? <span className="block text-destructive">{r.error}</span> : null}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
