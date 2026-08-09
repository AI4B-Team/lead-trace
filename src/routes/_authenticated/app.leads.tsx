import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Users, ShieldCheck, ShieldAlert, Ban, Sparkles, Layers, HelpCircle, Wand2, Loader2, Download } from "lucide-react";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { formatLocation } from "@/lib/location";
import { listLeadRecords, getLeadListMemberships, exportLeadRecords } from "@/lib/monitoring.functions";
import { useTeamContext } from "@/hooks/use-team-context";
import { denialMessage } from "@/lib/team-roles.shared";
import { guardedExport } from "@/lib/guarded-export";
import { brandedFileName } from "@/lib/download-name";
import { type ExportFormat } from "@/lib/export-file";
import { enrichLeadRecord } from "@/lib/enrich-lead.functions";
import { RECORD_TYPE_LABEL } from "@/lib/monitoring.shared";
import { LeadTagChips } from "@/components/app/lead-tag-picker";
import { LeadDetailDrawer } from "@/components/app/lead-detail-drawer";
import { PhoneCell, EmailCell } from "@/components/app/channel-icons";
import { mailingAddress } from "@/lib/contact-channels";
import { aggregateFields, type LeadField } from "@/lib/lead-fields";

export const Route = createFileRoute("/_authenticated/app/leads")({
  validateSearch: (search: Record<string, unknown>) => ({
    onlyNew: search.onlyNew === true || search.onlyNew === "true",
  }),
  head: () => ({
    meta: [
      { title: "Leads — LeadTrace" },
      { name: "description", content: "Every record you own, de-duplicated across every list — with disposition, source, and how many lists each record appeared in." },
    ],
  }),
  component: LeadsPage,
});

const SOURCE_LABEL: Record<string, string> = {
  business: "Business",
  records: "Public Records",
  upload: "Upload",
  social: "Social",
};

const DISPOSITION_TONE: Record<string, string> = {
  clean: "bg-success/10 text-success border-success/20",
  dnc: "bg-warn/10 text-warn border-warn/20",
  litigator: "bg-danger/10 text-danger border-danger/20",
};

function Stat({ icon, label, value, tone, help, sub }: { icon: React.ReactNode; label: string; value: string; tone?: string; help?: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            {icon}
            <span>{label}</span>
          </div>
          {help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p>{help}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className={`mt-2 font-display text-2xl font-bold ${tone ?? "text-foreground"}`}>{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function LeadsPage() {
  return <LeadsPageInner />;
}

// On-demand enrichment (boss 2026-08-03): one click → skip-trace provider →
// owner/mailing/property intel lands on the record. Phones/emails start
// flowing automatically once Realeflow exposes their skip-trace contact data.
function EnrichButton({ leadId, hasAddress }: { leadId: string; hasAddress: boolean }) {
  const { workspaceId } = useWorkspaceId();
  // Skip trace spends credits, so it's gated by the same build_list permission
  // the server enforces.
  const canEnrich = useTeamContext().can("build_list");
  const queryClient = useQueryClient();
  const enrich = useServerFn(enrichLeadRecord);
  const mutation = useMutation({
    mutationFn: () => enrich({ data: { workspaceId: workspaceId!, leadRecordId: leadId } }),
    onSuccess: (res) => {
      const bits = [
        res.ownerName ? `Owner: ${res.ownerName}` : null,
        res.absenteeOwner ? "Absentee Owner" : null,
        res.phoneFound ? `Phone: ${res.phoneFound}` : null,
        res.propertyValue ? `Value: $${res.propertyValue.toLocaleString()}` : null,
      ].filter(Boolean);
      toast.success("Lead Enriched", {
        description: bits.length ? bits.join(" · ") : "Property record matched.",
      });
      void queryClient.invalidateQueries({ queryKey: ["lead-records"] });
    },
    onError: (e) => {
      toast.error("Enrichment Failed", { description: (e as Error).message });
    },
  });

  if (!hasAddress || !canEnrich) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>Enrich — Pull Owner, Mailing Address &amp; Property Intel (1 Skip-Trace Credit)</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ListMembershipCell({ leadId, count }: { leadId: string; count: number }) {
  const { workspaceId } = useWorkspaceId();
  const [open, setOpen] = useState(false);
  const fetchLists = useServerFn(getLeadListMemberships);
  const { data, isLoading } = useQuery({
    queryKey: ["lead-lists", workspaceId, leadId],
    queryFn: () => fetchLists({ data: { workspaceId: workspaceId!, leadRecordId: leadId } }),
    enabled: open && !!workspaceId,
  });
  const lists = data?.lists ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            count > 1
              ? "cursor-pointer inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info transition-colors hover:bg-info/20"
              : "cursor-pointer inline-flex items-center text-[13px] text-muted-foreground underline-offset-2 hover:underline"
          }
        >
          {count > 1 ? (
            <>
              <Layers className="h-3 w-3" />
              {count} Lists
            </>
          ) : (
            "1"
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="px-2 pb-2 text-xs uppercase tracking-wide text-muted-foreground">Appears In</div>
        {isLoading && <div className="px-2 py-1 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && lists.length === 0 && (
          <div className="px-2 py-1 text-sm text-muted-foreground">No List Found.</div>
        )}
        <div className="max-h-64 overflow-y-auto">
          {lists.map((l) => (
            <Link
              key={l.id}
              to="/app/lists/$listId"
              params={{ listId: l.listId }}
              className="block rounded-md px-2 py-1.5 hover:bg-surface-muted"
              onClick={() => setOpen(false)}
            >
              <div className="text-sm font-medium text-foreground">{l.name}</div>
              <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LeadsPageInner() {
  const { workspaceId } = useWorkspaceId();
  const team = useTeamContext();
  const { onlyNew: onlyNewParam } = Route.useSearch();
  const fetchRecords = useServerFn(listLeadRecords);
  const fetchExport = useServerFn(exportLeadRecords);

  const [q, setQ] = useState("");
  const [disposition, setDisposition] = useState<"all" | "clean" | "dnc" | "litigator">("all");
  const [sourceType, setSourceType] = useState("all");
  const [channel, setChannel] = useState<"all" | "phone" | "email" | "address">("all");
  const [lineType, setLineType] = useState<"all" | "mobile" | "landline" | "voip" | "unknown">("all");
  const [onlyNew, setOnlyNew] = useState<boolean>(onlyNewParam === true);
  const [multiList, setMultiList] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lead-records", workspaceId, q, disposition, sourceType, channel, lineType, onlyNew, multiList],
    queryFn: () =>
      fetchRecords({
        data: {
          workspaceId: workspaceId!,
          disposition,
          sourceType,
          channel,
          lineType: channel === "phone" ? lineType : "all",
          onlyNew,
          multiList,
          ...(q.trim() ? { search: q.trim() } : {}),
        },
      }),
    enabled: !!workspaceId,
  });

  // The download always mirrors the filters on screen, so what the operator
  // sees is exactly what lands in the file. Routed through guardedExport so
  // every row leaving the workspace is attributed, capped and watermarked.
  const filters = { disposition, sourceType, channel, lineType: channel === "phone" ? lineType : "all" as const, onlyNew, multiList };
  const onExport = async (format: ExportFormat) => {
    if (!workspaceId) return;
    if (!team.can("export_list")) {
      return toast.error("Export Blocked", { description: denialMessage(team.role, "export_list") });
    }
    setExporting(true);
    try {
      const res = await fetchExport({
        data: { workspaceId, ...filters, ...(q.trim() ? { search: q.trim() } : {}) },
      });
      const scope = disposition === "all" ? "Leads Library" : `Leads Library · ${disposition.toUpperCase()}`;
      await guardedExport({
        workspaceId,
        rows: res.rows as Array<Record<string, unknown>>,
        format,
        scope,
        fileName: (ext) => brandedFileName("Leads Library", "All Leads", ext),
        sheetName: "Leads",
      });
    } catch (e) {
      toast.error("Export Failed", { description: e instanceof Error ? e.message : "Could Not Build The File." });
    } finally {
      setExporting(false);
    }
  };

  const stats = data?.stats;
  const rows = data?.rows ?? [];
  // Data-driven columns: the Leads master merges many list shapes, so its
  // columns follow what's present in the CURRENT filtered view — never one
  // list's criteria. Website is a display field, never a contact channel.
  // Candidates come from the shared registry, so a creator run's handle /
  // platform / followers surface here the same way the export file shows them.
  // Registry fields present in this view, plus any novel fields a custom
  // scrape contributed — no column code per source.
  const dynamicCols: LeadField[] = aggregateFields(rows as Array<Record<string, unknown>>);
  const colCount = dynamicCols.length + 5;
  const byRecordType = Object.entries(data?.byRecordType ?? {});
  const bySource = Object.entries(data?.bySource ?? {});

  return (
    <TooltipProvider>
    <div>
      <PageHeader
        title="Leads"
        description="Every Record You Own, De-Duplicated Across Every List."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full" disabled={exporting || rows.length === 0}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void onExport("csv")}>Download CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onExport("xlsx")}>Download Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onExport("both")}>Download Both</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat icon={<Users className="h-4 w-4" />} label="Total Leads" value={(stats?.total ?? 0).toLocaleString()} help="The total number of unique lead records across every list in this workspace, after de-duplication." />
          <Stat
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Clean / Textable"
            value={(stats?.clean ?? 0).toLocaleString()}
            tone="text-success"
            sub={`Reachable — SMS ${(stats?.smsEligible ?? 0).toLocaleString()} · Email ${(stats?.emailReachable ?? 0).toLocaleString()} · Mail ${(stats?.mailable ?? 0).toLocaleString()}`}
            help={`Leads that passed DNC, litigator, and line-type checks and are safe to message. Reachable by SMS: ${(stats?.smsEligible ?? 0).toLocaleString()}, email: ${(stats?.emailReachable ?? 0).toLocaleString()}, direct mail: ${(stats?.mailable ?? 0).toLocaleString()}.`}
          />
          <Stat icon={<ShieldAlert className="h-4 w-4" />} label="DNC Suppressed" value={(stats?.dnc ?? 0).toLocaleString()} tone="text-warn" help="Leads suppressed because they matched the Do Not Call list or opted out." />
          <Stat icon={<Ban className="h-4 w-4" />} label="Litigators Blocked" value={(stats?.litigator ?? 0).toLocaleString()} tone="text-danger" help="Leads flagged as known litigators or serial TCPA plaintiffs and blocked from outreach." />
          <Stat icon={<Sparkles className="h-4 w-4" />} label="New This Week" value={(stats?.newThisWeek ?? 0).toLocaleString()} tone="text-primary" help="New lead records first seen in the last 7 days across any list." />
      </div>

      {/* One condensed metadata line: mix, record types, and de-dupe note. */}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {bySource.length > 0 && (
          <span>
            <span className="uppercase tracking-wide">Sources</span>{" "}
            {bySource.map(([s, n]) => `${SOURCE_LABEL[s] ?? s} ${n.toLocaleString()}`).join(" · ")}
          </span>
        )}
        {bySource.length > 0 && byRecordType.length > 0 && <span className="text-border">|</span>}
        {byRecordType.length > 0 && (
          <span>
            <span className="uppercase tracking-wide">Types</span>{" "}
            {byRecordType.map(([t, n]) => `${RECORD_TYPE_LABEL[t] ?? t} ${n.toLocaleString()}`).join(" · ")}
          </span>
        )}
        {(stats?.multiList ?? 0) > 0 && (
          <>
            <span className="text-border">|</span>
            <span>{(stats?.multiList ?? 0).toLocaleString()} In 2+ Lists, De-Duplicated</span>
          </>
        )}
      </p>

      <Card className="mt-4 mb-4">
        <CardContent className="p-4 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search By Name, Phone, Email, Or Location…" className="pl-9" />
          </div>
          <Select value={disposition} onValueChange={(v) => setDisposition(v as typeof disposition)}>
            <SelectTrigger className="lg:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dispositions</SelectItem>
              <SelectItem value="clean">Clean</SelectItem>
              <SelectItem value="dnc">DNC</SelectItem>
              <SelectItem value="litigator">Litigator</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger className="lg:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="business">Business</SelectItem>
              <SelectItem value="records">Public Records</SelectItem>
              <SelectItem value="upload">Upload</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger className="lg:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="phone">Has Phone</SelectItem>
              <SelectItem value="email">Has Email</SelectItem>
              <SelectItem value="address">Has Mailing Address</SelectItem>
            </SelectContent>
          </Select>
          {channel === "phone" && (
            <Select value={lineType} onValueChange={(v) => setLineType(v as typeof lineType)}>
              <SelectTrigger className="lg:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Line Type</SelectItem>
                <SelectItem value="mobile">Mobile Only</SelectItem>
                <SelectItem value="landline">Landline</SelectItem>
                <SelectItem value="voip">VoIP</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={onlyNew ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setOnlyNew((v) => !v)}
            >
              New Since Last Run
            </Button>
            <Button
              type="button"
              variant={multiList ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setMultiList((v) => !v)}
            >
              <Layers className="mr-1 h-4 w-4" /> Multi-List
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="p-4">Name / Business</th>
                {dynamicCols.map((f) => (
                  <th key={f.key} className="p-4">{f.label}</th>
                ))}
                <th className="p-4">Disposition</th>
                <th className="p-4">Lists</th>
                <th className="p-4">Last Seen</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={colCount} className="p-6 text-center text-muted-foreground">Loading Leads…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={colCount} className="p-8 text-center text-muted-foreground">
                  No Records Match These Filters Yet.
                </td></tr>
              )}
              {rows.map((r) => {
                const primary = r.business_name || r.full_name;
                const secondary = r.business_name && r.full_name ? r.full_name : null;
                const location = formatLocation(r.city, r.state);
                const sources = (r.source_types ?? []).map((s) => SOURCE_LABEL[s] ?? s).join(", ");
                const contact = {
                  phone: r.phone,
                  phone_type: r.phone_type,
                  email: r.email,
                  address: r.address,
                  city: r.city,
                  state: r.state,
                  zip: r.zip,
                  website: r.website,
                  socials: (r.socials ?? null) as Record<string, string> | null,
                  disposition: r.disposition,
                };
                return (
                <tr
                  key={r.id}
                  onClick={() => setOpenLeadId(r.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-muted"
                >
                  <td className="p-4">
                    <div className="flex items-start gap-2">
                      <span className="w-9 shrink-0 pt-0.5">
                        {r.is_new && (
                          <Badge className="bg-primary text-primary-foreground text-[9px] h-[1.05rem] px-1.5 py-0">NEW</Badge>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className={primary ? "font-medium text-foreground" : "font-medium italic text-muted-foreground"}>
                          {primary || "Unknown Owner"}
                        </div>
                        {secondary && <div className="text-xs text-muted-foreground">{secondary}</div>}
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {location || "Location Unknown"}
                          {sources ? <span className="text-muted-foreground/70"> · {sources}</span> : null}
                        </div>
                        {!!r.tags?.length && (
                          <div className="mt-1">
                            <LeadTagChips tags={r.tags} max={4} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {dynamicCols.map((f) => {
                    const k = f.key;
                    return (
                    <td key={k} className="p-4" onClick={(e) => e.stopPropagation()}>
                      {k === "phone" ? (
                        <PhoneCell contact={contact} />
                      ) : k === "email" ? (
                        <EmailCell contact={contact} />
                      ) : k === "address" ? (
                        r.address ? (
                          <div className="max-w-[200px]">
                            <div className="truncate text-foreground" title={mailingAddress(contact)}>{r.address}</div>
                            <div className="text-xs text-muted-foreground">Mailable</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )
                      ) : k === "website" ? (
                        r.website ? (
                        <a
                          href={/^https?:/.test(r.website) ? r.website : `https://${r.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block max-w-[180px] truncate text-foreground underline-offset-2 hover:underline"
                          title={r.website}
                        >
                          {r.website.replace(/^https?:\/\//, "")}
                        </a>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )
                      ) : f.channel ? (
                        // Custom outreach-channel field (e.g. a county portal's
                        // "mailing_address"): channel treatment, generic render.
                        (() => {
                          const v = f.value(r as unknown as Record<string, unknown>);
                          if (!v) return <span className="text-muted-foreground/40">—</span>;
                          return (
                            <div className="max-w-[200px]">
                              <div className="truncate text-foreground" title={v}>{v}</div>
                              <div className="text-xs text-muted-foreground">
                                {f.channel === "address" ? "Mailable" : f.channel === "email" ? "Emailable" : "Textable"}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        // Display fields — registry identity fields and unknown
                        // custom-scrape fields alike. Never reachability.
                        (() => {
                          const v = f.value(r as unknown as Record<string, unknown>);
                          if (!v) return <span className="text-muted-foreground/40">—</span>;
                          return (
                            <span
                              className={`block max-w-[160px] truncate ${k === "handle" ? "font-medium text-foreground" : "text-muted-foreground"}`}
                              title={v}
                            >
                              {k === "handle" && !v.startsWith("@") && !/^https?:/.test(v) ? `@${v}` : v}
                            </span>
                          );
                        })()
                      )}
                    </td>
                    );
                  })}
                  <td className="p-4">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${DISPOSITION_TONE[r.disposition] ?? "border-border text-muted-foreground"}`}>
                      {r.disposition}
                    </span>
                  </td>
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <ListMembershipCell leadId={r.id} count={r.list_count} />
                  </td>
                  <td
                    className="p-4 text-muted-foreground whitespace-nowrap"
                    title={`First Seen ${new Date(r.first_seen_at).toLocaleDateString()}`}
                  >
                    {new Date(r.last_seen_at).toLocaleDateString()}
                  </td>
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <EnrichButton leadId={r.id} hasAddress={!!r.address} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <LeadDetailDrawer
        workspaceId={workspaceId}
        leadRecordId={openLeadId}
        onOpenChange={(o) => { if (!o) setOpenLeadId(null); }}
      />
    </div>
    </TooltipProvider>
  );
}
