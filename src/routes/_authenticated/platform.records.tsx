import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Database, FileSpreadsheet, Loader2, Mail, Radar, RefreshCw, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  listRequestPathSurplus,
  scheduleRecordsRequest,
  sendRecordsRequestsNow,
  setDataSourceStatus,
  setSurplusCustodian,
  sweepRequestPathSurplus,
  remapReturnedFile,
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

/** Canonical fields a returned spreadsheet can fill, in review order. */
const MAPPABLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "owner", label: "Owner Or Respondent" },
  { key: "case_id", label: "Case Number" },
  { key: "case_date", label: "Filing Date" },
  { key: "status", label: "Status" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount" },
];

const NONE = "__none__";

/**
 * One-time manual mapping for a file we could not read. The saved mapping is
 * remembered for the agency, so this is the only time a human sees it.
 */
function ColumnMapper({
  columns,
  sampleRows,
  busy,
  onSave,
}: {
  columns: string[];
  sampleRows: Array<Record<string, unknown>>;
  busy: boolean;
  onSave: (columnMap: Record<string, string>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  if (columns.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        No column headings were captured for this file — ask the agency to resend it as CSV or Excel.
      </p>
    );
  }

  const sample = (col: string) =>
    sampleRows.map((r) => String(r[col] ?? "").trim()).filter(Boolean)[0] ?? "";

  return (
    <div className="space-y-3 py-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {MAPPABLE_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">{f.label}</label>
            <Select
              value={draft[f.key] ?? NONE}
              onValueChange={(v) =>
                setDraft((d) => {
                  const next = { ...d };
                  if (v === NONE) delete next[f.key];
                  else next[f.key] = v;
                  return next;
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Not In File" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not In File</SelectItem>
                {columns.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                    {sample(c) ? ` — ${sample(c).slice(0, 24)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || !draft.address} onClick={() => onSave(draft)}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save Mapping And Re-Ingest
        </Button>
        {!draft.address ? (
          <span className="text-[11px] text-muted-foreground">An address column is required.</span>
        ) : null}
      </div>
    </div>
  );
}

function PublicRecordsPage() {
  const qc = useQueryClient();
  const fetchSources = useServerFn(listDataSources);
  const fetchAgencies = useServerFn(listAgencies);
  const runDiscovery = useServerFn(discoverDataSources);
  const setStatus = useServerFn(setDataSourceStatus);
  const schedule = useServerFn(scheduleRecordsRequest);
  const sendNow = useServerFn(sendRecordsRequestsNow);
  const fetchRequestPath = useServerFn(listRequestPathSurplus);
  const saveCustodian = useServerFn(setSurplusCustodian);
  const runRequestSweep = useServerFn(sweepRequestPathSurplus);
  const remapFile = useServerFn(remapReturnedFile);

  const [recordType, setRecordType] = useState<string>(DISCOVERY_RECORD_TYPES[0]);
  const reference = useReferenceData();

  const sourcesQ = useQuery({ queryKey: ["admin-data-sources"], queryFn: () => fetchSources() });
  const agenciesQ = useQuery({ queryKey: ["admin-agencies"], queryFn: () => fetchAgencies() });
  const requestPathQ = useQuery({ queryKey: ["admin-request-path"], queryFn: () => fetchRequestPath() });
  const [custodianDraft, setCustodianDraft] = useState<Record<string, string>>({});
  const [mappingFile, setMappingFile] = useState<string | null>(null);

  const remap = useMutation({
    mutationFn: (v: { fileId: string; columnMap: Record<string, string> }) => remapFile({ data: v }),
    onSuccess: (r) => {
      if (r.status === "parsed") {
        toast.success(`Mapped and ingested ${r.rowsParsed} rows to ${r.distributedTo} workspaces.`);
        setMappingFile(null);
      } else {
        toast.error(r.error ?? "Still could not read the file with that mapping.");
      }
      void qc.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCustodian = useMutation({
    mutationFn: (v: { countyName: string; state: string; email: string }) => saveCustodian({ data: v }),
    onSuccess: () => {
      toast.success("Custodian saved — request scheduled monthly.");
      void qc.invalidateQueries({ queryKey: ["admin-request-path"] });
      void qc.invalidateQueries({ queryKey: ["admin-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestSweep = useMutation({
    mutationFn: () => runRequestSweep(),
    onSuccess: (r) => {
      const waiting = r.results.filter((x) => x.status === "awaiting_contact").length;
      toast.success(`${r.results.length - waiting} scheduled, ${waiting} awaiting a custodian address.`);
      void qc.invalidateQueries({ queryKey: ["admin-request-path"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
  const requestPath = requestPathQ.data?.counties ?? [];
  const awaitingContact = requestPath.filter((c) => !c.contactEmail).length;
  const requestFor = (agencyId: string) => requests.find((r) => r.agency_id === agencyId);
  // A sender-side block affects every request at once, so say it once at the top
  // instead of leaving the same red line repeated down the table.
  const senderBlocked = requests.some((r) => {
    const e = String(r.last_error ?? "").toLowerCase();
    return e.includes("not configured") || e.includes("domain_not_verified") || e.includes("emails_disabled");
  });

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
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                      {s.status === "policy_blocked" && s.last_error ? (
                        <p className="mt-1 max-w-[26rem] text-[10px] leading-snug text-muted-foreground">
                          {s.last_error}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {s.status === "policy_blocked" ? (
                        // Re-enabling would restart a crawl the source owner forbids.
                        <span className="text-[10px] text-muted-foreground">Not collectable</span>
                      ) : (
                        <Button
                        size="sm"
                        variant={s.status === "enabled" ? "ghost" : "secondary"}
                        onClick={() =>
                          toggle.mutate({ id: s.id, status: s.status === "enabled" ? "disabled" : "enabled" })
                        }
                      >
                        {s.status === "enabled" ? "Disable" : "Enable"}
                      </Button>
                      )}
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
          {senderBlocked && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Requests are composed and queued, but nothing can leave yet — the sender domain still needs to be set up
              and verified before records requests will mail out. Nothing is lost in the meantime: every due request
              stays queued and goes out on the next sweep once sending is live.
            </div>
          )}
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
      {/* Request-path surplus counties -------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <Mail className="h-4 w-4 text-primary" /> Surplus By Request
            </CardTitle>
            <CardDescription>
              These counties publish no machine-readable surplus list, so coverage runs through a standing records
              request. Each one needs a records custodian address before anything can be asked for.
              {awaitingContact > 0 ? ` ${awaitingContact} still awaiting an address.` : ""}
            </CardDescription>
          </div>
          <Button
            className="shrink-0"
            variant="secondary"
            onClick={() => requestSweep.mutate()}
            disabled={requestSweep.isPending}
          >
            {requestSweep.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Run Sweep
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {requestPathQ.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : requestPath.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No counties are on the request path right now.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>County</TableHead>
                  <TableHead className="w-[130px]">Sale Kind</TableHead>
                  <TableHead className="w-[130px]">Cadence</TableHead>
                  <TableHead className="w-[140px]">Request</TableHead>
                  <TableHead>Custodian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestPath.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">
                        {c.countyName} County, {c.state}
                      </div>
                      {c.notes ? (
                        <div className="max-w-[26rem] text-[11px] leading-snug text-muted-foreground">{c.notes}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{c.saleKind.replace("_", " ")}</TableCell>
                    <TableCell className="text-xs capitalize">{c.cadence}</TableCell>
                    <TableCell>
                      {c.requestStatus ? (
                        <Badge variant="outline" className="text-[10px]">
                          {REQUEST_STATUS_LABEL[c.requestStatus] ?? c.requestStatus}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                          Awaiting Contact
                        </Badge>
                      )}
                      {c.lastSentAt ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Sent {new Date(c.lastSentAt).toLocaleDateString()}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {c.contactEmail ? (
                        <div className="text-xs">
                          <div>{c.contactEmail}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {c.agencyName}
                            {c.responsive === false ? " · unproven" : ""}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-[240px] text-xs"
                            placeholder="records@clerk.example.gov"
                            value={custodianDraft[c.id] ?? ""}
                            onChange={(e) =>
                              setCustodianDraft((d) => ({ ...d, [c.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!(custodianDraft[c.id] ?? "").includes("@") || addCustodian.isPending}
                            onClick={() =>
                              addCustodian.mutate({
                                countyName: c.countyName,
                                state: c.state,
                                email: (custodianDraft[c.id] ?? "").trim(),
                              })
                            }
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                  <Fragment key={f.id}>
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
                      {f.parse_status === "needs_mapping" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-2 h-6 px-2 text-[11px]"
                          onClick={() => setMappingFile(mappingFile === f.id ? null : f.id)}
                        >
                          {mappingFile === f.id ? "Close" : "Map Columns"}
                        </Button>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(f.received_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                  {mappingFile === f.id ? (
                    <TableRow key={`${f.id}-map`}>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <ColumnMapper
                          columns={(f.detected_columns as string[] | null) ?? []}
                          sampleRows={(f.sample_rows as Array<Record<string, unknown>> | null) ?? []}
                          busy={remap.isPending}
                          onSave={(columnMap: Record<string, string>) =>
                            remap.mutate({ fileId: f.id, columnMap })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
