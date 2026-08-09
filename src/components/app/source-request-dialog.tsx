import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BellPlus, Check, Loader2, ShieldCheck, ScanSearch, Megaphone } from "lucide-react";
import { requestCoverage } from "@/lib/assistant.functions";
import {
  DESIRED_FIELD_OPTIONS, FREQUENCY_OPTIONS, LOGIN_OPTIONS, screenSourceRequest,
  type LoginRequirement, type SourceRequestFrequency,
} from "@/lib/source-request.shared";

export type SourceRequestType = "county" | "record_type" | "template_adapter";

/**
 * Enriched intake for sources LeadTrace can't run yet. Collects enough detail to
 * scope the adapter build, screens the ask for compliance before it's queued,
 * and confirms what happens next.
 */
export function SourceRequestDialog({
  open,
  onOpenChange,
  workspaceId,
  type,
  templateId = null,
  presetLabel = "",
  presetGeo = "",
  presetUrl = "",
  onQueued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  type: SourceRequestType;
  templateId?: string | null;
  presetLabel?: string;
  presetGeo?: string;
  presetUrl?: string;
  onQueued?: (info: { email: string | null }) => void;
}) {
  const submit = useServerFn(requestCoverage);
  const [label, setLabel] = useState(presetLabel);
  const [url, setUrl] = useState(presetUrl);
  const [geo, setGeo] = useState(presetGeo);
  const [fields, setFields] = useState<string[]>(["Name", "Phone"]);
  const [frequency, setFrequency] = useState<SourceRequestFrequency>("one_time");
  const [login, setLogin] = useState<LoginRequirement>("none");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string | null; tier: string; reason: string | null; outreach: string } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  // Re-seed whenever the dialog is reopened for a different source.
  useEffect(() => {
    if (!open) return;
    setLabel(presetLabel);
    setUrl(presetUrl);
    setGeo(presetGeo);
    setFields(["Name", "Phone"]);
    setFrequency("one_time");
    setLogin("none");
    setNotes("");
    setDone(null);
    setBlocked(null);
    setBusy(false);
  }, [open, presetLabel, presetGeo, presetUrl]);

  const payload = useMemo(
    () => ({
      sourceLabel: label.trim(),
      targetUrl: url.trim() || null,
      desiredFields: fields,
      geo: geo.trim() || null,
      frequency,
      notes: notes.trim() || null,
      loginRequired: login,
    }),
    [label, url, fields, geo, frequency, notes, login],
  );

  // Live preview of the same tiering the server enforces.
  const preview = useMemo(() => screenSourceRequest(payload), [payload]);
  const named = label.trim().length > 2;
  const previewTier = named ? preview.tier : "standard";
  const previewReason = named ? preview.reason : null;

  const toggleField = (f: string) =>
    setFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const send = async () => {
    if (!workspaceId || !label.trim()) return;
    setBusy(true);
    setBlocked(null);
    try {
      const res = await submit({
        data: {
          workspaceId,
          county: type === "county" ? label.trim() : null,
          recordType: type === "record_type" ? label.trim() : type === "template_adapter" ? label.trim() : null,
          templateId,
          type,
          ...payload,
        },
      });
      if (res?.screened) {
        setBlocked(res.reason ?? "We Can't Build This Source Compliantly.");
        return;
      }
      setDone({
        email: res?.email ?? null,
        tier: res?.tier ?? "standard",
        reason: res?.reason ?? null,
        outreach: res?.outreach?.text ?? preview.outreach.text,
      });
      onQueued?.({ email: res?.email ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Submit Request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {done.tier === "review" ? (
                  <><ScanSearch className="h-5 w-5 text-warning" /> Request Received — Under Review</>
                ) : (
                  <><Check className="h-5 w-5 text-success" /> Request Received</>
                )}
              </DialogTitle>
              <DialogDescription>
                {done.tier === "review"
                  ? `${label.trim()} Is Logged And Waiting On A Human Terms Review Before We Build It.`
                  : `${label.trim()} Is On The Build Backlog. Requests From Multiple Workspaces Get Prioritized First.`}
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {done.tier === "review" ? (
                <li>• {done.reason}</li>
              ) : (
                <li>• We Scope The Adapter Against The Fields And Cadence You Asked For.</li>
              )}
              <li>• You'll Get An Email At {done.email ?? "Your Account Address"} The Day It Goes Live.</li>
              <li>• Nothing Was Charged — Requests Never Spend Credits.</li>
            </ul>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span><span className="font-semibold text-foreground">Outreach Use: </span>{done.outreach}</span>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </>
        ) : blocked ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" /> We Can't Build This One
              </DialogTitle>
              <DialogDescription>{blocked}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              We Logged It So You Have A Record, But It Won't Be Queued For Build. Reword The Request Around Publicly
              Available Contact Data And Submit Again.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBlocked(null)}>Edit Request</Button>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><BellPlus className="h-5 w-5 text-primary" /> Request A Source</DialogTitle>
              <DialogDescription>
                Tell Us What You Need And We'll Scope The Adapter. The More Detail, The Faster It Ships.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="src-label">Source Name</Label>
                <Input
                  id="src-label"
                  autoFocus
                  className="mt-1"
                  value={label}
                  placeholder="e.g. Miami-Dade Code Violations, New LLC Filings"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="src-url">Source URL <span className="text-muted-foreground">(Optional)</span></Label>
                <Input
                  id="src-url"
                  className="mt-1"
                  value={url}
                  placeholder="https://county.gov/records/search"
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Public Records Portals Are Fine Even If They Require A Free Account.
                </p>
              </div>

              <div>
                <Label>Does It Require A Login?</Label>
                <Select value={login} onValueChange={(v) => setLogin(v as LoginRequirement)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOGIN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label} — {o.hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A Free County Or Court Account Is Standard. Paid Or Terms-Restricted Platforms Go To Human Review.
                </p>
              </div>

              <div>
                <Label>Fields You Need</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DESIRED_FIELD_OPTIONS.map((f) => {
                    const on = fields.includes(f);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleField(f)}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          on
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="src-geo">Geography</Label>
                  <Input
                    id="src-geo"
                    className="mt-1"
                    value={geo}
                    placeholder="e.g. Florida — Miami-Dade, Broward"
                    onChange={(e) => setGeo(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Refresh Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as SourceRequestFrequency)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label} — {o.hint}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="src-notes">Anything Else <span className="text-muted-foreground">(Optional)</span></Label>
                <Textarea
                  id="src-notes"
                  className="mt-1"
                  rows={3}
                  value={notes}
                  placeholder="Filters That Matter, Volume You Expect, How You'll Use The List"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {previewTier === "rejected" ? (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{previewReason}</span>
                  </div>
                ) : previewTier === "review" ? (
                  <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
                    <ScanSearch className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="font-semibold">Needs Review — </span>
                      {previewReason ?? "We'll Read The Terms Before Building This One."}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>
                      <span className="font-semibold text-foreground">Standard — </span>
                      Public Data And Public Records Queue Normally, Including Portals That Ask For A Free Account.
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold text-foreground">Outreach Use (Judged Separately): </span>
                    {preview.outreach.text}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline" className="text-[10px] uppercase">No Credits Spent</Badge>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button disabled={busy || label.trim().length < 3 || previewTier === "rejected"} onClick={() => void send()}>
                  {busy ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Submitting…</>
                  ) : previewTier === "review" ? (
                    "Submit For Review"
                  ) : (
                    "Submit Request"
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}