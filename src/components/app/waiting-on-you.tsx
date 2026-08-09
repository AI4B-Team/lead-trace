/**
 * "Waiting On You" — the daily brief's approval queue. Only things that
 * genuinely need a person: Coach copy edits, Booking Auditor corrections,
 * Wisdom Miner patterns, Scorer weight changes. Lead nominations are work and
 * live in the worklist, not here.
 */
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPendingProposals, reviewAgentProposal } from "@/lib/agents/agents.functions";
import { agentDefinition } from "@/lib/agents/registry.shared";

const TITLE: Record<string, string> = {
  scorer_weights: "Updated Lead Weighting",
  bot_copy_edit: "Wording Change",
  booking_review: "Check This Booking Before Anyone Drives",
  objection_response: "Captured Objection Answer",
  cadence_timing: "Cadence Change",
};

export function WaitingOnYou({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const fetchPending = useServerFn(getPendingProposals);
  const { data } = useQuery({
    queryKey: ["pending-proposals", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchPending({ data: { workspaceId: workspaceId! } }),
  });
  const review = useMutation({
    mutationFn: useServerFn(reviewAgentProposal),
    onSuccess: () => {
      toast.success("Decision Recorded");
      qc.invalidateQueries({ queryKey: ["pending-proposals", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const proposals = data?.proposals ?? [];
  if (proposals.length === 0) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-display">
          <ShieldCheck className="h-4 w-4 text-primary" /> Waiting On You
          <Badge variant="secondary">{proposals.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {proposals.map((p) => (
          <div key={p.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">
                {agentDefinition(p.agent_key ?? "")?.name ?? p.agent_key}
              </Badge>
              <span className="font-semibold">
                {TITLE[p.proposal_type ?? ""] ?? p.proposal_type}
              </span>
              {p.target_field && <span className="text-muted-foreground">on {p.target_field}</span>}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{p.rationale}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={review.isPending}
                onClick={() =>
                  workspaceId &&
                  review.mutate({ data: { workspaceId, proposalId: p.id, decision: "approved" } })
                }
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={review.isPending}
                onClick={() =>
                  workspaceId &&
                  review.mutate({ data: { workspaceId, proposalId: p.id, decision: "rejected" } })
                }
              >
                <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}