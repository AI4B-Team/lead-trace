import { Link, createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, Gauge, Terminal, BookOpen, Code2, Webhook, Plug } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsShell } from "@/components/app/settings-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WebhookEndpoints } from "@/components/app/webhook-endpoints";
import { WebhookDeliveries } from "@/components/app/webhook-deliveries";

export const Route = createFileRoute("/_authenticated/app/api")({
  head: () => ({
    meta: [
      { title: "API — LeadTrace" },
      { name: "description", content: "Manage LeadTrace API keys, event webhooks, rate limits, and endpoint references." },
      { property: "og:title", content: "API — LeadTrace" },
      { property: "og:description", content: "Manage LeadTrace API keys, event webhooks, rate limits, and endpoint references." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeveloperPage,
});

const ENDPOINTS = [
  { method: "GET", path: "/api/public/v1/leads", note: "List clean leads with filters and paging." },
  { method: "GET", path: "/api/public/v1/jobs", note: "List runs and their pipeline stages." },
  { method: "POST", path: "/api/public/v1/jobs", note: "Trigger a new list run." },
  { method: "GET", path: "/api/public/v1/jobs/{jobId}", note: "Fetch a single run with stage counts." },
  { method: "GET", path: "/api/public/v1/campaigns", note: "List campaigns and delivery totals." },
];

function DeveloperPage() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current="developer">
        <PageHeader
          title="Webhooks & API Reference"
          description="Event webhooks, rate limits, and endpoint references for building on LeadTrace. API keys live on your Account page."
        />

        <div className="max-w-4xl space-y-6">
          <section id="webhooks" className="scroll-mt-24">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-base font-bold text-foreground">Event Webhooks</h2>
              <p className="text-xs text-muted-foreground">Endpoints, delivery status, and payload reference.</p>
            </div>

            <div className="mt-3">
              <WebhookEndpoints />
            </div>

            <WebhookDeliveries />

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-display">
                    <Webhook className="h-4 w-4 text-muted-foreground" /> Event Payloads
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Every delivery is signed and retried with backoff. Events cover list completion,
                  new clean leads, and inbound replies.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-display">
                    <Plug className="h-4 w-4 text-muted-foreground" /> Connector Apps
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Zapier, Sheets, CRMs, and the Real Elite Suite live on the Integrations page.</span>
                  <Button variant="outline" size="sm" className="rounded-full" asChild>
                    <Link to="/app/integrations">Open</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="flex items-center gap-2 text-sm font-display">
                  <Gauge className="h-4 w-4 text-muted-foreground" /> Rate Limits
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">Per key, per workspace</span>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                <div>120 requests per minute per key.</div>
                <div>10 run triggers per minute per workspace.</div>
                <div>429 responses include a Retry-After header.</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-display">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Authentication
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Send your key as <code className="rounded bg-muted px-1 py-0.5">Authorization: Bearer &lt;token&gt;</code>.
                Requests are scoped to the workspaces your key belongs to.
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Code2 className="h-4 w-4 text-primary" /> Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {ENDPOINTS.map((e) => (
                <div key={`${e.method}-${e.path}`} className="flex flex-wrap items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <Badge variant="outline" className="font-mono text-[10px]">{e.method}</Badge>
                  <code className="text-xs text-foreground">{e.path}</code>
                  <span className="text-xs text-muted-foreground">{e.note}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="flex items-center gap-2 text-sm font-display">
                  <Terminal className="h-4 w-4 text-muted-foreground" /> Quickstart
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">Use your key from Settings</span>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-foreground">
{`curl -H "Authorization: Bearer $LEADTRACE_KEY" \\
  https://leadtrace.com/api/public/v1/leads`}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-display">
                  <BookOpen className="h-4 w-4 text-muted-foreground" /> SDKs & Docs
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                TypeScript and Python SDKs are on the roadmap. Until then the endpoints below are
                plain REST with bearer-token auth.
              </CardContent>
            </Card>
          </div>
        </div>
      </SettingsShell>
    </div>
  );
}
