import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Smartphone, CreditCard, Bot, ListChecks, Megaphone, CheckCircle2, AlertCircle,
  Plus, KeyRound, ArrowUpRight, ShieldCheck, Sparkles, Activity,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsShell } from "@/components/app/settings-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getTeamSize } from "@/lib/team-count.functions";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { ActivityList, useActivity } from "@/components/app/activity-feed";

export const Route = createFileRoute("/_authenticated/app/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace Admin — LeadTrace" },
      { name: "description", content: "Manage your company: team, numbers, credits, plan usage and workspace health." },
      { property: "og:title", content: "Workspace Admin — LeadTrace" },
      { property: "og:description", content: "Manage your company: team, numbers, credits, plan usage and workspace health." },
    ],
  }),
  component: WorkspaceAdmin,
});

async function count(table: string, workspaceId: string) {
  const { count: c } = await supabase
    .from(table as never)
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  return c ?? 0;
}

function useWorkspaceAdmin(workspaceId: string | null) {
  return useQuery({
    queryKey: ["workspace-admin", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const id = workspaceId!;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        members, numbers, agents, lists, campaigns, leads, knowledge, hooks,
      ] = await Promise.all([
        // The roster is admin-only at the row level; the seat total comes from
        // a membership-checked server function instead of a client row count.
        getTeamSize({ data: { workspaceId: id } }).then((r) => r.size),
        count("sending_numbers", id),
        count("brands", id),
        count("jobs", id),
        count("campaigns", id),
        count("leads", id),
        count("bot_knowledge", id),
        count("webhook_endpoints", id),
      ]);

      const [{ data: balances }, { data: ws }, { data: reg }, { count: sms }, { count: optOuts }] =
        await Promise.all([
          supabase.from("credit_balances").select("balance").eq("workspace_id", id),
          supabase.from("workspaces").select("plan, billing_plan").eq("id", id).maybeSingle(),
          supabase.from("registrations").select("brand_status, campaign_status").eq("workspace_id", id).maybeSingle(),
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", id)
            .eq("direction", "outbound")
            .gte("created_at", monthStart.toISOString()),
          supabase
            .from("suppression")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", id),
        ]);

      return {
        members, numbers, agents, lists, campaigns, leads, knowledge, hooks,
        smsThisMonth: sms ?? 0,
        optOuts: optOuts ?? 0,
        credits: (balances ?? []).reduce((sum, r) => sum + Number(r.balance ?? 0), 0),
        plan: ws?.plan ?? ws?.billing_plan ?? "starter",
        tenDlcApproved: reg?.brand_status === "approved" && reg?.campaign_status === "approved",
      };
    },
  });
}

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  professional: "Professional",
  scale: "Scale",
  enterprise: "Enterprise",
};

function Metric({ icon: Icon, label, value, to }: {
  icon: typeof Users; label: string; value: string; to: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <div className="mt-1.5 font-display text-2xl tabular-nums text-foreground">{value}</div>
    </Link>
  );
}

function HealthRow({ ok, label, hint, to }: { ok: boolean; label: string; hint: string; to: string }) {
  return (
    <Link to={to} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      {ok
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function WorkspaceAdmin() {
  const { workspaceId, workspaceName } = useWorkspaceId();
  const { data } = useWorkspaceAdmin(workspaceId);
  const { data: feed } = useActivity(workspaceId, "all", 8);
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());

  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current="workspace-admin">
        <PageHeader
          title="Workspace Admin"
          description={`Everything About ${workspaceName ?? "This Workspace"} — Team, Numbers, Credits, Plan Usage And Health.`}
        />

        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Metric icon={Users} label="Team Members" value={n(data?.members)} to="/app/team" />
          <Metric icon={Smartphone} label="Phone Numbers" value={n(data?.numbers)} to="/app/numbers" />
          <Metric icon={CreditCard} label="Credits" value={n(data?.credits)} to="/app/billing" />
          <Metric icon={Bot} label="AI Agents" value={n(data?.agents)} to="/app/agent" />
          <Metric icon={ListChecks} label="Lists" value={n(data?.lists)} to="/app/lists" />
          <Metric icon={Megaphone} label="Campaigns" value={n(data?.campaigns)} to="/app/campaigns" />
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Workspace Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5 pt-0">
                <HealthRow
                  ok={!!data?.tenDlcApproved}
                  label={data?.tenDlcApproved ? "10DLC Approved" : "10DLC Not Approved Yet"}
                  hint="Carrier Registration For Your Brand And Campaign."
                  to="/app/registration"
                />
                <HealthRow
                  ok={(data?.knowledge ?? 0) > 0}
                  label={(data?.knowledge ?? 0) > 0 ? "AI Agent Trained" : "AI Agent Needs Training"}
                  hint="Knowledge Sources Your Agent Answers From."
                  to="/app/agent"
                />
                <HealthRow
                  ok={(data?.numbers ?? 0) > 0}
                  label={(data?.numbers ?? 0) > 0 ? "Number Connected" : "No Sending Number"}
                  hint="At Least One Active Number Is Required To Send."
                  to="/app/numbers"
                />
                <HealthRow
                  ok
                  label="Compliance Healthy"
                  hint={`${n(data?.optOuts)} Suppressed ${data?.optOuts === 1 ? "Contact" : "Contacts"} Enforced On Every Send.`}
                  to="/app/compliance"
                />
                <HealthRow
                  ok={(data?.hooks ?? 0) > 0}
                  label={(data?.hooks ?? 0) > 0 ? "API Connected" : "API Not Connected"}
                  hint="Webhooks And Keys For Your CRM Or Automations."
                  to="/app/integrations"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Activity className="h-4 w-4 text-primary" /> Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pt-0">
                <ActivityList events={feed?.events ?? []} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Current Plan</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="font-display text-xl text-foreground">
                  {PLAN_LABEL[data?.plan ?? ""] ?? "Starter"}
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {[
                    ["Credits", n(data?.credits)],
                    ["SMS This Month", n(data?.smsThisMonth)],
                    ["Leads", n(data?.leads)],
                    ["Lists", n(data?.lists)],
                    ["Campaigns", n(data?.campaigns)],
                    ["Team Members", n(data?.members)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="tabular-nums font-medium text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Button asChild size="sm" className="mt-4 w-full rounded-full">
                  <Link to="/app/billing">Manage Plan</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5 pt-0">
                {([
                  [Users, "Invite Team", "/app/team"],
                  [CreditCard, "Buy Credits", "/app/billing"],
                  [Smartphone, "Purchase Number", "/app/numbers"],
                  [Plus, "Upgrade Plan", "/app/billing"],
                  [Sparkles, "Train AI Agent", "/app/agent"],
                  [KeyRound, "Connect CRM", "/app/integrations"],
                ] as const).map(([Icon, label, to]) => (
                  <Link
                    key={label}
                    to={to}
                    className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-muted/40"
                  >
                    <Icon className="h-4 w-4 text-primary" /> {label}
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </SettingsShell>
    </div>
  );
}
