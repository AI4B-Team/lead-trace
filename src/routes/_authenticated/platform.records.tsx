import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Database, FileSpreadsheet, Loader2, Mail, Radar, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DISCOVERY_RECORD_TYPES } from "@/lib/data-providers/source-mapping";
import { recordTypeDisplayName } from "@/lib/record-types";
import { useReferenceData } from "@/hooks/use-reference-data";
import {
  discoverDataSources,
  listAgencies,
  listDataSources,
  scheduleRecordsRequest,
  sendRecordsRequestsNow,
  setDataSourceStatus,
} from "@/lib/records-admin.functions";
import { CADENCE_LABEL, REQUEST_STATUS_LABEL, statuteFor } from "@/lib/records-requests.shared";

export const Route = createFileRoute("/_authenticated/platform/records")({
  head: () => ({
    meta: [
      { title: "Public Records — LeadTrace Platform" },
      {
        name: "description",
        content:
          "Catalog county open-data sources, run discovery sweeps, and manage standing public records requests to agencies.",
      },
      { property: "og:title", content: "Public Records — LeadTrace Platform" },
      {
        property: "og:description",
        content: "Source discovery and public records request operations for county coverage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicRecordsPage,
});

const STATUS_TONE: Record<string, string> = {
  enabled: "border-success/40 text-success",
  verified: "border-primary/40 text-primary",
  discovered: "border-border text-muted-foreground",
  disabled: "border-border text-muted-foreground",
  failed: "border-destructive/40 text-destructive",
  // Not broken and not our choice to pause: the source owner forbids collection.
  policy_blocked: "border-warning/40 text-warning",
};

const STATUS_LABEL: Record<string, string> = {
  policy_blocked: "Policy Blocked",
};

function PublicRecordsPage() {
  const qc = useQueryClient();
  const fetchSources = useServerFn(listDataSources);
  const fetchAgencies = useServerFn(listAgencies);
  const runDiscovery = useServerFn(discoverDataSources);
  const setStatus = useServerFn(setDataSourceStatus);
  const schedule = useServerFn(scheduleRecordsRequest);
  const sendNow = useServerFn(sendRecordsRequestsNow);

  const [recordType, setRecordType] = useState<string>(DISCOVERY_RECORD_TYPES[0]);
  const reference = useReferenceData();

  const sourcesQ = useQuery({ queryKey: ["admin-data-sources"], queryFn: () => fetchSources() });
  const agenciesQ = useQuery({ queryKey: ["admin-agencies"], queryFn: () => fetchAgencies() });

  const discover = useMutation({
    mutationFn: () => runDiscovery({ data: { recordType } }),
    onSuccess: (r) => {
      toast.success(`Found ${r.found} datasets, saved ${r.saved}.`);
      void qc.invalidateQueries({ queryKey: ["admin-data-sources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; status: "enabled" | "disabled" }) => setStatus({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-data-sources"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleReq = useMutation({
    mutationFn: (agencyId: string) => schedule({ data: { agencyId, cadence: "monthly" } }),
    onSuccess: () => {
      toast.success("Request composed and scheduled monthly.");
      void qc.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: () => sendNow(),
    onSuccess: (r) => {
      const failed = r.results.filter((x) => !x.sent);
      if (failed.length > 0) toast.warning(failed[0]?.error ?? "Some requests could not be sent.");
      else toast.success(`Sent ${r.processed} request(s).`);
      void qc.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sources = sourcesQ.data?.sources ?? [];
  const agencies = agenciesQ.data?.agencies ?? [];
  const requests = agenciesQ.data?.requests ?? [];
  const files = agenciesQ.data?.files ?? [];
  const requestFor = (agencyId: string) => requests.find((r) => r.agency_id === agencyId);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Public Records"
        description="Discover county data feeds automatically, then cover the rest by standing records request — one request per agency per cycle, distributed to every subscribed workspace."
      />

      {/* Discovery ---------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <Radar className="h-4 w-4 text-primary" /> Source Discovery
            </CardTitle>
            <CardDescription>
              Sweeps every open-data domain at once, then keeps only datasets that carry a usable address.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select value={recordType} onValueChange={setRecordType}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCOVERY_RECORD_TYPES.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {recordTypeDisplayName(slug, reference.recordTypes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => discover.mutate()} disabled={discover.isPending}>
              {discover.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Run Sweep
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {sourcesQ.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : sources.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No catalogued sources yet — run a sweep to populate the catalog.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead className="w-[110px]">Platform</TableHead>
                  <TableHead className="w-[160px]">Jurisdiction</TableHead>
                  <TableHead className="w-[180px]">Record Type</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.title ?? s.dataset_id}</div>
                      <div className="max-w-[320px] truncate text-[11px] text-muted-foreground">
                        {s.domain}
                        {s.dataset_id ? ` · ${s.dataset_id}` : ""}
                      </div>
                      {s.last_error && (
                        <div className="text-[11px] text-destructive">{s.last_error}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">
                      {s.platform === "socrata" ? "Open Data" : s.platform === "arcgis" ? "County GIS" : "Bulk File"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {[s.county_name, s.state].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{s.record_type}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[s.status] ?? ""}`}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={s.status === "enabled" ? "ghost" : "secondary"}
                        onClick={() =>
                          toggle.mutate({ id: s.id, status: s.status === "enabled" ? "disabled" : "enabled" })
                        }
                      >
                        {s.status === "enabled" ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Records requests --------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <Mail className="h-4 w-4 text-primary" /> Records Requests
            </CardTitle>
            <CardDescription>
              Each request cites the governing statute for its state and asks for a machine-readable export. One send
              per agency per cycle, no matter how many workspaces want the county.
            </CardDescription>
          </div>
          <Button className="shrink-0" onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Send Due Requests
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {agenciesQ.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : agencies.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No agency contacts yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency &amp; Contact</TableHead>
                  <TableHead className="w-[200px]">Record Types</TableHead>
                  <TableHead className="w-[130px]">Cadence</TableHead>
                  <TableHead className="w-[130px]">Status</TableHead>
                  <TableHead className="w-[120px]">Last Sent</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencies.map((a) => {
                  const req = requestFor(a.id);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">
                          {a.agency_name}
                          {a.department ? ` — ${a.department}` : ""}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {[a.contact_name, a.contact_title].filter(Boolean).join(", ")}
                          {a.email ? ` · ${a.email}` : ""}
                          {a.phone ? ` · ${a.phone}` : ""}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {[a.county_name, a.state].filter(Boolean).join(", ")} · {statuteFor(a.state)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(a.record_types ?? []).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {req ? (CADENCE_LABEL[req.cadence as "monthly"] ?? req.cadence) : "—"}
                      </TableCell>
                      <TableCell>
                        {req ? (
                          <Badge variant="outline" className="text-[10px]">
                            {REQUEST_STATUS_LABEL[req.status] ?? req.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not Scheduled</span>
                        )}
                        {req?.last_error && (
                          <div className="mt-1 text-[11px] text-destructive">{req.last_error}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {req?.last_sent_at ? new Date(req.last_sent_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => scheduleReq.mutate(a.id)}
                          disabled={scheduleReq.isPending}
                        >
                          {req ? "Recompose" : "Compose"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Returned files ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-display">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Returned Files
          </CardTitle>
          <CardDescription>
            Parsed files flow straight into the pipeline. Anything we cannot map waits here for a one-time mapping,
            which is then remembered for that agency.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {files.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Database className="mr-1 inline h-4 w-4" /> No files received yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="w-[110px]">Rows</TableHead>
                  <TableHead className="w-[110px]">Parsed</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[130px]">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.filename}</TableCell>
                    <TableCell className="tabular-nums">{f.rows_total}</TableCell>
                    <TableCell className="tabular-nums">{f.rows_parsed}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          f.parse_status === "parsed"
                            ? "border-success/40 text-success"
                            : f.parse_status === "failed"
                              ? "border-destructive/40 text-destructive"
                              : "border-warning/40 text-warning"
                        }`}
                      >
                        {f.parse_status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(f.received_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
