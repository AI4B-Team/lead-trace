import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Building2, ShieldCheck, Users, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBilling } from "@/lib/billing.functions";
import { getComplianceState } from "@/lib/compliance.functions";
import { computeCompliance } from "@/lib/compliance.shared";
import { getTeamSize } from "@/lib/team-count.functions";
import { useWorkspaceId } from "@/hooks/use-workspace";

const CREDITS: Array<{ key: "scrape" | "skip_trace" | "sms"; label: string }> = [
  { key: "scrape", label: "Lead Credits" },
  { key: "skip_trace", label: "Skip Trace" },
  { key: "sms", label: "SMS" },
];

/**
 * Right rail for the Settings page: workspace identity, plan, credit health,
 * compliance posture and team size — everything a workspace owner checks first.
 */
export function SettingsSummary({ ownerName }: { ownerName: string }) {
  const { workspaceId, workspaceName } = useWorkspaceId();
  const fetchBilling = useServerFn(getBilling);
  const fetchCompliance = useServerFn(getComplianceState);
  const fetchTeamSize = useServerFn(getTeamSize);

  const { data: billing } = useQuery({
    queryKey: ["billing", workspaceId],
    queryFn: () => fetchBilling({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const { data: compliance } = useQuery({
    queryKey: ["compliance-state", workspaceId],
    queryFn: () => fetchCompliance({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const { data: teamSize } = useQuery({
    queryKey: ["team-size", workspaceId],
    queryFn: async () => (await fetchTeamSize({ data: { workspaceId: workspaceId! } })).size,
    enabled: !!workspaceId,
  });

  // Same computed state the Compliance Center renders — never a second formula.
  const state = computeCompliance({
    brandStatus: compliance?.registration.brand_status ?? null,
    campaignStatus: compliance?.registration.campaign_status ?? null,
    stopHandling: true,
    replyDetection: true,
    lastScrubAt: compliance?.lastScrubAt ?? null,
    suppressionTotal: compliance?.suppression.total ?? 0,
  });
  const health = state.score;
  const scrubOk = state.checks.some((c) => c.label === "DNC Database Current" && c.ok);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-display font-bold text-foreground">
                {workspaceName ?? "Workspace"}
              </div>
              <div className="text-xs text-muted-foreground">Owner · {ownerName}</div>
            </div>
          </div>

          <Row label="Plan">
            <Badge variant="secondary">Trial</Badge>
          </Row>
          <Row label="Billing">
            <span className="text-sm font-medium">Pay-As-You-Go</span>
          </Row>
          <Row label="Team">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {teamSize ?? 1} {teamSize === 1 ? "Member" : "Members"}
            </span>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Credits
            </div>
            <Link
              to="/app/billing"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Top Up <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {CREDITS.map(({ key, label }) => {
            const value = billing?.balances[key] ?? 0;
            const max = Math.max(1000, value);
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-semibold">{value.toLocaleString()}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Compliance Health
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-bold ${
                health >= 90 ? "text-success" : health >= 70 ? "text-warn" : "text-danger"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              {health}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${
                health >= 90 ? "bg-success" : health >= 70 ? "bg-warn" : "bg-danger"
              }`}
              style={{ width: `${health}%` }}
            />
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Texting Brand">
              <StatusText
                ok={state.stage === "live"}
                okLabel="Registered"
                pendingLabel={state.tenDlcLabel}
              />
            </Row>
            <Row label="STOP Handling">
              <StatusText ok okLabel="Enabled" pendingLabel="Off" />
            </Row>
            <Row label="DNC Scrub">
              <StatusText ok={scrubOk} okLabel="Current" pendingLabel="Stale" />
            </Row>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full rounded-full">
            <Link to="/app/compliance">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Open Compliance
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function StatusText({
  ok,
  okLabel,
  pendingLabel,
}: {
  ok: boolean;
  okLabel: string;
  pendingLabel: string;
}) {
  return (
    <span className={`text-sm font-medium ${ok ? "text-success" : "text-warn"}`}>
      {ok ? okLabel : pendingLabel}
    </span>
  );
}