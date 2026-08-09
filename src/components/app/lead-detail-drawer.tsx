/**
 * Lead detail drawer — click any row in Leads to see the full profile:
 * contact channels, skip-trace / property intel, list memberships, message
 * and call history, disposition, tags, and team notes.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Trash2, MessageSquare, Phone, Mail, MapPin, StickyNote, Bot, Star } from "lucide-react";
import { toast } from "sonner";
import { getLeadDetail, addLeadNote, deleteLeadNote, clearLeadShortlist } from "@/lib/lead-detail.functions";
import { resolvedProfileForLead } from "@/lib/bot-profiles.functions";
import { LeadTagBar } from "@/components/app/lead-tag-picker";
import { formatLocation } from "@/lib/location";
import { useTeamContext } from "@/hooks/use-team-context";

const INTEL_LABEL: Record<string, string> = {
  owner_name: "Owner",
  mailing_street: "Mailing Street",
  mailing_city: "Mailing City",
  mailing_state: "Mailing State",
  mailing_zip: "Mailing ZIP",
  absentee_owner: "Absentee Owner",
  property_value: "Property Value",
  estimated_equity: "Estimated Equity",
  provider: "Provider",
  traced_at: "Traced",
};

function fmtIntel(key: string, value: string | number | boolean | null): string {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    return key.includes("value") || key.includes("equity")
      ? `$${value.toLocaleString()}`
      : value.toLocaleString();
  }
  if (key === "traced_at") return new Date(value).toLocaleString();
  return value;
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Which conversation profile the AI agent uses for this lead. */
function ResolvedProfileRow({ workspaceId, leadId }: { workspaceId: string; leadId: string }) {
  const resolve = useServerFn(resolvedProfileForLead);
  const { data } = useQuery({
    queryKey: ["resolved-profile", workspaceId, leadId],
    queryFn: () => resolve({ data: { workspaceId, leadId } }),
  });
  if (!data) return null;
  return (
    <div className="mb-3">
      <Row
        icon={<Bot className="h-3.5 w-3.5" />}
        label="Agent Profile"
        value={
          data.error ? (
            <span className="text-destructive">Unresolved — Add A Default Profile</span>
          ) : (
            <span>
              {data.name}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({data.matched?.replace(/_/g, " ")}
                {data.isPlatform ? ", platform" : ""})
              </span>
            </span>
          )
        }
      />
    </div>
  );
}

export function LeadDetailDrawer({
  workspaceId,
  leadRecordId,
  onOpenChange,
}: {
  workspaceId: string | null | undefined;
  leadRecordId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getLeadDetail);
  const { canWrite } = useTeamContext();
  const runAddNote = useServerFn(addLeadNote);
  const runDeleteNote = useServerFn(deleteLeadNote);
  const [note, setNote] = useState("");

  const open = !!leadRecordId && !!workspaceId;
  const { data, isLoading } = useQuery({
    queryKey: ["lead-detail", workspaceId, leadRecordId],
    queryFn: () => fetchDetail({ data: { workspaceId: workspaceId!, leadRecordId: leadRecordId! } }),
    enabled: open,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["lead-detail", workspaceId, leadRecordId] });

  const addNote = useMutation({
    mutationFn: () =>
      runAddNote({ data: { workspaceId: workspaceId!, leadRecordId: leadRecordId!, body: note.trim() } }),
    onSuccess: () => {
      setNote("");
      void invalidate();
    },
    onError: (e) => toast.error("Could Not Save Note", { description: (e as Error).message }),
  });

  const clearShortlistFn = useServerFn(clearLeadShortlist);
  const clearShortlist = useMutation({
    mutationFn: () => clearShortlistFn({ data: { workspaceId: workspaceId!, leadRecordId: leadRecordId! } }),
    onSuccess: () => {
      toast.success("Removed From Shortlist");
      void invalidate();
      void qc.invalidateQueries({ queryKey: ["lead-records"] });
    },
    onError: (e) => toast.error("Could Not Update", { description: e instanceof Error ? e.message : "Try Again." }),
  });

  const removeNote = useMutation({
    mutationFn: (noteId: string) => runDeleteNote({ data: { workspaceId: workspaceId!, noteId } }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error("Could Not Delete Note", { description: (e as Error).message }),
  });

  const r = data?.record;
  const title = r?.business_name || r?.full_name || "Unknown Owner";
  const intelEntries = Object.entries(data?.intel ?? {}).filter(([k]) => k !== "address_hash");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">{title}</SheetTitle>
          <SheetDescription>
            {r ? formatLocation(r.city, r.state) || "Location Unknown" : "Loading Lead…"}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Lead…
          </div>
        )}

        {r && (
          <div className="space-y-5 px-4 pb-8">
            <section>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Contact</h3>
              <Row icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={r.phone ? `${r.phone}${r.phone_type ? ` · ${r.phone_type}` : ""}` : "—"} />
              <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={r.email || "—"} />
              <Row
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Address"
                value={[r.address, r.city, r.state, r.zip].filter(Boolean).join(", ") || "—"}
              />
              <Row label="Disposition" value={<span className="capitalize">{r.disposition}</span>} />
              <Row label="Lists" value={r.list_count.toLocaleString()} />
              <Row label="First Seen" value={new Date(r.first_seen_at).toLocaleDateString()} />
              <Row label="Last Seen" value={new Date(r.last_seen_at).toLocaleDateString()} />
              {data?.outcome?.status && (
                <Row
                  label="Outcome"
                  value={`${data.outcome.status}${data.outcome.reason ? ` — ${data.outcome.reason}` : ""}`}
                />
              )}
            </section>

            {r.nominated_at && (
              <>
                <Separator />
                <section>
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Shortlist</h3>
                  <div className="flex items-start gap-2 rounded-md border border-border bg-surface-muted p-3">
                    <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="font-medium text-foreground">
                        Shortlisted {new Date(r.nominated_at).toLocaleDateString()}
                        {typeof r.nominated_score === "number" ? ` · Score ${r.nominated_score}` : ""}
                      </div>
                      {r.nominated_reason && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{r.nominated_reason}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Lead Scout Nominated This Record And A Person Approved It. Nothing Was Sent.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        disabled={clearShortlist.isPending || !canWrite}
                        onClick={() => clearShortlist.mutate()}
                      >
                        {clearShortlist.isPending ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Remove From Shortlist
                      </Button>
                    </div>
                  </div>
                </section>
              </>
            )}

            <Separator />

            <section>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Tags</h3>
              {data?.primaryLeadId && workspaceId ? (
                <ResolvedProfileRow workspaceId={workspaceId} leadId={data.primaryLeadId} />
              ) : null}
              {data?.primaryLeadId ? (
                <LeadTagBar workspaceId={workspaceId} leadId={data.primaryLeadId} />
              ) : (
                <p className="text-sm text-muted-foreground">No List Lead To Tag Yet.</p>
              )}
            </section>

            <Separator />

            <section>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Skip Trace &amp; Property Intel
              </h3>
              {intelEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not Enriched Yet — Use The Enrich Button On The Lead Row.
                </p>
              ) : (
                intelEntries.map(([k, v]) => (
                  <Row key={k} label={INTEL_LABEL[k] ?? k.replace(/_/g, " ")} value={fmtIntel(k, v)} />
                ))
              )}
            </section>

            <Separator />

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" /> Message History
              </h3>
              {(data?.messages.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No Messages Or Calls Yet.</p>
              ) : (
                <div className="space-y-2">
                  {data!.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-md border p-2 text-sm ${
                        m.direction === "inbound"
                          ? "border-border bg-surface-muted"
                          : "border-primary/20 bg-primary/5"
                      }`}
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="capitalize">
                          {m.direction} · {m.channel}
                          {m.is_bot ? " · Bot" : ""}
                          {m.is_optout ? " · Opt-Out" : ""}
                          {m.recording_seconds ? ` · ${m.recording_seconds}s` : ""}
                        </span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-foreground">
                        {m.body || m.transcript || (m.channel === "voice" ? "Call — No Transcript" : "—")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <StickyNote className="h-3.5 w-3.5" /> Notes
              </h3>
              {!canWrite && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Read-Only Access — Ask An Admin For Member Access To Add Notes.
                </p>
              )}
              <div className={canWrite ? "flex flex-col gap-2" : "hidden"}>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add A Note For Your Team…"
                  rows={3}
                />
                <Button
                  type="button"
                  size="sm"
                  className="self-end"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() => addNote.mutate()}
                >
                  {addNote.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Save Note
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {(data?.notes.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">No Notes Yet.</p>
                )}
                {data?.notes.map((n) => (
                  <div key={n.id} className="rounded-md border border-border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                      <button
                        type="button"
                        hidden={!canWrite}
                        onClick={() => removeNote.mutate(n.id)}
                        className="text-muted-foreground/60 transition-colors hover:text-danger"
                        aria-label="Delete Note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}