import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Webhook, Zap, Link2, Sheet, Mail, Plug, Check, Building2, Database,
  Contact, Cloud, Users, Workflow, ShieldCheck, AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { SettingsShell } from "@/components/app/settings-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { HubConnection } from "@/components/app/hub-connection";
import { listWebhooks } from "@/lib/monitoring.functions";
import { getVendorStatus } from "@/lib/providers.functions";
import { getHubLink } from "@/lib/hub.functions";
import { submitFeedback } from "@/lib/help.functions";

export const Route = createFileRoute("/_authenticated/app/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — LeadTrace" },
      { name: "description", content: "Connect LeadTrace to webhooks, CRMs, the Real Elite suite, and the rest of your stack." },
      { property: "og:title", content: "Integrations — LeadTrace" },
      { property: "og:description", content: "Connect LeadTrace to webhooks, CRMs, the Real Elite suite, and the rest of your stack." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationsPage,
});

type Status = "connected" | "not_connected" | "soon";

type Connector = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: Status;
  detail?: "hub";
  action?: "api";
};

function IntegrationsPage() {
  const { workspaceId } = useWorkspaceId();
  const fetchHooks = useServerFn(listWebhooks);
  const fetchHub = useServerFn(getHubLink);
  const fetchVendors = useServerFn(getVendorStatus);
  const logRequest = useServerFn(submitFeedback);
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [requested, setRequested] = useState<string[]>([]);
  const [ask, setAsk] = useState("");
  const [asked, setAsked] = useState(false);

  const { data: hooks } = useQuery({
    queryKey: ["webhooks", workspaceId],
    queryFn: () => fetchHooks({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
  const { data: hub } = useQuery({
    queryKey: ["hub-link", workspaceId],
    queryFn: () => fetchHub({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
  const { data: vendorData } = useQuery({
    queryKey: ["vendor-status"],
    queryFn: () => fetchVendors(),
  });

  const hookCount = hooks?.rows?.length ?? 0;
  const hubConnected = Boolean(hub?.linked);

  async function request(c: Connector) {
    setRequested((prev) => [...prev, c.key]);
    try {
      await logRequest({
        data: { body: `Integration request: ${c.title}`, category: "Feature Request" },
      });
      toast.success(`Logged your request for ${c.title}.`);
    } catch {
      toast.error("Could not log that request. Please try again.");
      setRequested((prev) => prev.filter((k) => k !== c.key));
    }
  }

  async function submitAsk() {
    const body = ask.trim();
    if (!body) return;
    setAsk("");
    setAsked(true);
    try {
      await logRequest({ data: { body: `Integration request: ${body}`, category: "Feature Request" } });
    } catch {
      toast.error("Could not log that request. Please try again.");
    }
  }

  const groups: { label: string; hint: string; items: Connector[] }[] = [
    {
      label: "Outbound",
      hint: "Push lists, leads, and replies out to other tools.",
      items: [
        {
          key: "webhooks",
          title: "Webhooks",
          description: "Push list, lead, and reply events to any endpoint. Configured on the API page.",
          icon: Webhook,
          status: hookCount > 0 ? "connected" : "not_connected",
          action: "api",
        },
        { key: "zapier", title: "Zapier", description: "Route leads into 6,000+ apps without code.", icon: Zap, status: "soon" },
        { key: "sheets", title: "Google Sheets", description: "Sync clean leads into a live spreadsheet.", icon: Sheet, status: "soon" },
        { key: "email-tool", title: "Email Tool Handoff", description: "Send verified emails to your marketing platform.", icon: Mail, status: "soon" },
      ],
    },
    {
      label: "CRM",
      hint: "Send clean leads straight into your CRM.",
      items: [
        { key: "resimpli", title: "REsimpli", description: "Push clean leads into your REsimpli pipeline.", icon: Database, status: "soon" },
        { key: "podio", title: "Podio", description: "Sync leads and campaign replies to your Podio workspace.", icon: Workflow, status: "soon" },
        { key: "followupboss", title: "FollowUp Boss", description: "Create and update contacts automatically.", icon: Contact, status: "soon" },
        { key: "gohighlevel", title: "GoHighLevel", description: "Drop leads into any GHL sub-account.", icon: Users, status: "soon" },
        { key: "salesforce", title: "Salesforce", description: "Map leads to Salesforce objects and campaigns.", icon: Cloud, status: "soon" },
        { key: "hubspot", title: "HubSpot", description: "Create contacts and log outreach activity.", icon: Building2, status: "soon" },
      ],
    },
    {
      label: "Real Elite Suite",
      hint: "Shared account across the Real Elite products.",
      items: [
        {
          key: "hub",
          title: "Real Elite",
          description: "Shared login, contacts, and automations across the suite.",
          icon: Link2,
          status: hubConnected ? "connected" : "not_connected",
          detail: "hub",
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current="integrations">
        <PageHeader title="Integrations" description="Connect LeadTrace to the rest of your stack." />

        <div className="space-y-8">
          <section id="data vendors" className="scroll-mt-24">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-base font-bold text-foreground">Data Vendors</h2>
              <p className="text-xs text-muted-foreground">
                The sources and compliance checks behind every list.
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(vendorData?.vendors ?? []).map((v) => (
                <Card key={v.key}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start gap-2">
                      {v.configured ? (
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <p className="text-sm font-medium leading-snug text-foreground">{v.label}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{v.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {groups.map((g) => (
            <section key={g.label} id={g.label.toLowerCase()} className="scroll-mt-24">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-base font-bold text-foreground">{g.label}</h2>
                <p className="text-xs text-muted-foreground">{g.hint}</p>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {g.items.map((c) => (
                  <ConnectorCard
                    key={c.key}
                    connector={c}
                    expanded={open === c.key}
                    requested={requested.includes(c.key)}
                    onToggle={() => setOpen(open === c.key ? null : c.key)}
                    onRequest={() => request(c)}
                    onOpenApi={() => navigate({ to: "/app/api", hash: "webhooks" })}
                  />
                ))}
              </div>

              {g.items.some((c) => c.detail && open === c.key) && (
                <div className="mt-4">{open === "hub" && <HubConnection />}</div>
              )}
            </section>
          ))}

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Plug className="h-4 w-4 text-primary" /> Need Another Integration?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tell us which tool you want LeadTrace to talk to and we'll prioritize it. Webhooks
                already cover most custom handoffs today.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitAsk();
                  }}
                  placeholder="Which tool should LeadTrace talk to?"
                  className="max-w-sm"
                  aria-label="Which tool should LeadTrace talk to?"
                />
                <Button className="rounded-full" disabled={!ask.trim()} onClick={() => void submitAsk()}>
                  Submit
                </Button>
                {asked && <span className="text-xs text-success">Thanks — logged.</span>}
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsShell>
    </div>
  );
}

function ConnectorCard({
  connector, expanded, requested, onToggle, onRequest, onOpenApi,
}: {
  connector: Connector;
  expanded: boolean;
  requested: boolean;
  onToggle: () => void;
  onRequest: () => void;
  onOpenApi: () => void;
}) {
  const Icon = connector.icon;
  const soon = connector.status === "soon";
  const connected = connector.status === "connected";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-4 transition-colors",
        expanded ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <Badge
          variant="outline"
          className={cn(connected ? "border-success/30 text-success" : "text-muted-foreground")}
        >
          {connected ? "Connected" : soon ? "Coming Soon" : "Not Connected"}
        </Badge>
      </div>

      <div className="mt-3 text-sm font-semibold text-foreground">{connector.title}</div>
      <p className="mt-1 flex-1 text-xs text-muted-foreground">{connector.description}</p>

      <div className="mt-3">
        {soon ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={requested}
            onClick={onRequest}
          >
            {requested ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" /> Requested
              </>
            ) : (
              "Request This"
            )}
          </Button>
        ) : connector.action === "api" ? (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onOpenApi}>
            {connected ? "Manage" : "Set Up"}
          </Button>
        ) : (
          <Button
            variant={expanded ? "secondary" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {connected ? "Manage" : "Connect"}
          </Button>
        )}
      </div>
    </div>
  );
}
