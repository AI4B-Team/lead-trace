/**
 * The worklist. A nomination is "here is who to work" — it appears here with an
 * inline dismiss. There is no approval step, because approving sixteen
 * identical cards one at a time is busywork nobody asked for.
 */
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COLD_START_NOTE } from "@/lib/agents/scout.shared";
import {
  dismissWorklistNomination,
  getWorklistNominations,
} from "@/lib/agents/worklist.functions";

export function WorklistNominations({
  workspaceId,
  onOpenLead,
}: {
  workspaceId: string | null;
  onOpenLead?: (leadId: string) => void;
}) {
  const qc = useQueryClient();
  const fetchNoms = useServerFn(getWorklistNominations);
  const { data } = useQuery({
    queryKey: ["worklist-nominations", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchNoms({ data: { workspaceId: workspaceId!, limit: 20 } }),
  });
  const dismiss = useMutation({
    mutationFn: useServerFn(dismissWorklistNomination),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worklist-nominations", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nominations = data?.nominations ?? [];
  if (nominations.length === 0) return null;
  const coldStart = data?.coldStart ?? false;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base font-display">
          <Star className="h-4 w-4 text-primary" /> Worth Working Today
          <Badge variant="secondary">{nominations.length}</Badge>
        </CardTitle>
        {coldStart && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {COLD_START_NOTE}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {nominations.map((n) => (
          <div
            key={n.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <button
              type="button"
              className="font-semibold text-foreground hover:text-primary"
              onClick={() => onOpenLead?.(n.leadId)}
            >
              {n.name}
            </button>
            {n.location && <span className="text-xs text-muted-foreground">{n.location}</span>}
            {n.recordTypes.length > 0 && (
              <Badge variant="outline" className="text-[11px]">
                {n.recordTypes[0]}
              </Badge>
            )}
            {!coldStart && !n.coldStart && <Badge variant="secondary">Score {n.score}</Badge>}
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {n.reasons.join("; ")}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              disabled={dismiss.isPending}
              onClick={() =>
                workspaceId &&
                dismiss.mutate({ data: { workspaceId, nominationId: n.id } })
              }
            >
              <X className="mr-1 h-3.5 w-3.5" /> Dismiss
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}