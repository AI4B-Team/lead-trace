import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Webhook, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { deleteWebhook, listWebhooks, saveWebhook, setWebhookActive } from "@/lib/monitoring.functions";
import { EVENT_TYPES } from "@/lib/events.shared";

/**
 * Outbound webhooks (spec §15.2). Every delivery is HMAC-signed with the
 * endpoint secret so the receiver can verify it really came from us.
 */
export function WebhookEndpoints() {
  const { workspaceId } = useWorkspaceId();
  const fetchHooks = useServerFn(listWebhooks);
  const save = useServerFn(saveWebhook);
  const remove = useServerFn(deleteWebhook);
  const setActive = useServerFn(setWebhookActive);
  const qc = useQueryClient();

  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data } = useQuery({
    queryKey: ["webhooks", workspaceId],
    queryFn: () => fetchHooks({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const create = useMutation({
    mutationFn: () => save({ data: { workspaceId: workspaceId!, url, eventTypes: selected } }),
    onSuccess: () => {
      toast.success("Endpoint added.");
      setUrl("");
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["webhooks", workspaceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save endpoint."),
  });

  const rows = data?.rows ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Webhook className="h-4 w-4" /> Webhook Endpoints
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Push list, lead, and reply events to any external system. Each request is signed with your
          endpoint secret.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm text-foreground truncate">{r.url}</div>
                    {!r.active && (
                      <Badge variant="outline" className="border-danger/40 text-danger text-[10px] font-medium">
                        Paused
                      </Badge>
                    )}
                  </div>
                  {!r.active && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Turned off after repeated delivery failures. Fix the endpoint, then resume it.
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(r.event_types?.length ? r.event_types : ["All events"]).map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={async () => {
                    await setActive({ data: { id: r.id, active: !r.active } });
                    toast.success(r.active ? "Endpoint paused." : "Endpoint resumed.");
                    qc.invalidateQueries({ queryKey: ["webhooks", workspaceId] });
                    qc.invalidateQueries({ queryKey: ["webhook-deliveries", workspaceId] });
                  }}
                >
                  {r.active ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                  {r.active ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete endpoint"
                  onClick={async () => {
                    await remove({ data: { id: r.id } });
                    qc.invalidateQueries({ queryKey: ["webhooks", workspaceId] });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <Label htmlFor="hook-url">Endpoint URL</Label>
          <Input
            id="hook-url"
            className="mt-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com/hooks/leadtrace"
          />
        </div>
        <div>
          <Label>Events (leave empty for all)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {EVENT_TYPES.map((t) => {
              const on = selected.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border-border bg-muted text-foreground hover:bg-muted/70 hover:border-primary/40"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          className="rounded-full"
          disabled={!url.trim() || create.isPending || !workspaceId}
          onClick={() => create.mutate()}
        >
          {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Add endpoint
        </Button>
      </CardContent>
    </Card>
  );
}
