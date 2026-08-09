import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  ALL_PARTY_CONSENT_STATES,
  FORWARD_SCOPES,
  RECORDING_CONSENT_NOTICE,
  RECORDING_DISCLOSURE_LINE,
  withDisclosure,
  type ForwardScope,
} from "@/lib/call-events.shared";
import { SettingsShell } from "@/components/app/settings-shell";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, ShieldAlert, Loader2, PhoneForwarded, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { useTeamContext } from "@/hooks/use-team-context";
import {
  listNumbers,
  buyNumbers,
  getRegistration,
  updateInboundSettings,
  updateNumberLimits,
} from "@/lib/numbers.functions";
import { numberHealth, perNumberDailyCap } from "@/lib/deliverability.shared";
import { PhoneLink } from "@/components/app/phone-link";

export const Route = createFileRoute("/_authenticated/app/numbers")({
  head: () => ({ meta: [{ title: "Numbers — LeadTrace" }] }),
  component: Numbers,
});

type Region = "east" | "central" | "mountain" | "west";

function Numbers() {
  const { workspaceId } = useWorkspaceId();
  const team = useTeamContext();
  // Purchases and throttle/inbound changes are admin-gated server-side; mirror
  // that here so members don't hit a rejected write.
  const canBuy = team.can("purchase_credits");
  const canManage = team.can("manage_limits");
  const list = useServerFn(listNumbers);
  const buy = useServerFn(buyNumbers);
  const reg = useServerFn(getRegistration);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["numbers", workspaceId],
    queryFn: () => list({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
  const { data: regData } = useQuery({
    queryKey: ["registration", workspaceId],
    queryFn: () => reg({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<Region>("east");
  const [qtyInput, setQtyInput] = useState("3");
  const [areaCodesInput, setAreaCodesInput] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Numbers…</div>;
  }

  const numbers = data.rows;
  const unforwarded = numbers.filter((n) => !n.forward_calls_to).length;
  const active = numbers.filter((n) => n.status === "active").length;
  const avg = numbers.length
    ? Math.round(numbers.reduce((a, n) => a + (n.health_score ?? 0), 0) / numbers.length)
    : 0;
  const flagged = numbers.filter((n) => (n.optout_rate ?? 0) > 5).length;
  const rotating = numbers.filter((n) => (n.status ?? "active") === "active" && (n.health_score ?? 0) > 0).length;
  const campaignApproved = regData?.registration?.campaign_status === "approved";

  const submit = async () => {
    if (!workspaceId) return;
    const qty = Number(qtyInput);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      toast.error("Enter A Quantity Between 1 And 20.");
      return;
    }
    const areaCodes = areaCodesInput
      .split(/[^0-9]+/)
      .filter(Boolean);
    if (areaCodes.some((c) => c.length !== 3)) {
      toast.error("Area Codes Must Be 3 Digits, Separated By Commas.");
      return;
    }
    setBusy(true);
    try {
      const res = await buy({
        data: { workspaceId, region, quantity: qty, ...(areaCodes.length ? { areaCodes } : {}) },
      });
      toast.success(
        `Added ${res.added} Number${res.added === 1 ? "" : "s"} ${areaCodes.length ? `In ${areaCodes.join(", ")}` : `To ${region.toUpperCase()} Pool`}.`,
      );
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["numbers", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purchase Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current="numbers">
      <PageHeader
        title="Number Pool"
        description="Geo-Matched By Region. Auto-Retirement When Opt-Out Rate Climbs."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="rounded-full"
                disabled={!canBuy}
                title={canBuy ? undefined : "Only Admins Can Purchase Numbers"}
              >
                <Plus className="mr-1 h-4 w-4" /> Buy Numbers
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Buy Numbers Into A Region</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Region</Label>
                  <Select value={region} onValueChange={(v) => setRegion(v as Region)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="east">East</SelectItem>
                      <SelectItem value="central">Central</SelectItem>
                      <SelectItem value="mountain">Mountain</SelectItem>
                      <SelectItem value="west">West</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="3"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div>
                  <Label>Specific Area Codes (Optional)</Label>
                  <Input
                    placeholder="e.g. 305, 786, 954"
                    value={areaCodesInput}
                    onChange={(e) => setAreaCodesInput(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Leave Blank To Use The Region Pool. Numbers Cycle Through The Codes You List.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={busy} className="rounded-full">
                  {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Provision Numbers
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {!campaignApproved && (
        <div className="mb-6 rounded-2xl border border-warn/30 bg-warn/5 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-warn shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-display font-bold text-foreground">10DLC Registration Required Before Sending</div>
            <div className="text-sm text-muted-foreground">Numbers Can Be Purchased, But Sends Are Blocked Server-Side Until Your A2P Campaign Is Approved.</div>
          </div>
          <Button asChild size="sm" className="rounded-full">
            <Link to="/app/registration">Start 10DLC</Link>
          </Button>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Total Numbers" value={numbers.length} hint="In This Workspace" />
        <StatTile label="Active" value={active} hint="Eligible To Send" />
        <StatTile label="Rotating" value={rotating} hint="In Live Campaigns" />
        <StatTile
          label="Pool Health"
          value={numbers.length ? `${avg}%` : "—"}
          hint={flagged ? `${flagged} Flagged For Cooling` : "No Numbers Flagged"}
        />
        <StatTile label="Carrier" value="Telnyx" hint={campaignApproved ? "10DLC Approved" : "10DLC Pending"} />
      </div>
      {flagged > 0 && (
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {flagged} Number{flagged === 1 ? "" : "s"} Above 5% Opt-Out Rate — Auto-Flagged For Cooling.
        </div>
      )}

      <InboundCallCard
        workspaceId={workspaceId}
        canManage={canManage}
        unforwarded={unforwarded}
        total={numbers.length}
        currentForward={numbers.find((n) => n.forward_calls_to)?.forward_calls_to ?? ""}
        currentGreeting={numbers.find((n) => n.voicemail_greeting)?.voicemail_greeting ?? ""}
        recordingEnabled={numbers.some((n) => (n as { recording_enabled?: boolean }).recording_enabled)}
        recordingDisclosure={numbers.some((n) => (n as { recording_disclosure?: boolean }).recording_disclosure)}
      />

      <Card>
        <CardContent className="p-0">
          {numbers.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No Numbers Yet. Buy Your First Pool To Start Warming Up.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="p-4">Phone</th>
                  <th className="p-4">Region</th>
                  <th className="p-4">Health</th>
                  <th className="p-4">Opt-Out Rate</th>
                  <th className="p-4">Delivery</th>
                  <th className="p-4">Daily Cap</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Inbound Calls</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => {
                  const health = n.health_score ?? 0;
                  const optout = n.optout_rate ?? 0;
                  const paused = !!(n as { auto_paused_at?: string | null }).auto_paused_at;
                  const status = paused ? "paused" : optout > 5 ? "cooling" : (n.status ?? "active");
                  const delivery = numberHealth(n as never);
                  return (
                    <tr key={n.id} className="border-b border-border last:border-0">
                      <td className="p-4 font-medium text-foreground"><PhoneLink phone={n.phone} showIcon={false} /></td>
                      <td className="p-4 text-muted-foreground capitalize">{n.region ?? "—"}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full ${health > 80 ? "bg-success" : health > 60 ? "bg-warn" : "bg-danger"}`} style={{ width: `${health}%` }} />
                          </div>
                          <span className="text-foreground">{health}</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{optout.toFixed(1)}%</td>
                      <td className="p-4">
                        {delivery.deliveryRate == null ? (
                          <span className="text-muted-foreground">No receipts yet</span>
                        ) : (
                          <span
                            className={
                              delivery.status === "poor"
                                ? "text-danger"
                                : delivery.status === "watch"
                                  ? "text-warn"
                                  : "text-success"
                            }
                          >
                            {(delivery.deliveryRate * 100).toFixed(0)}%
                            <span className="ml-1 text-xs text-muted-foreground">
                              of {delivery.sample.toLocaleString()}
                            </span>
                          </span>
                        )}
                        {(n as { auto_pause_reason?: string | null }).auto_pause_reason ? (
                          <span className="mt-0.5 block text-xs text-danger">
                            {(n as { auto_pause_reason?: string | null }).auto_pause_reason}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-4">
                        <DailyCapCell
                          numberId={n.id}
                          cap={perNumberDailyCap(n as never)}
                          override={(n as { daily_cap_override?: number | null }).daily_cap_override ?? null}
                          paused={paused}
                          canManage={canManage}
                          onSaved={() => qc.invalidateQueries({ queryKey: ["numbers", workspaceId] })}
                        />
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={
                          status === "active" ? "bg-success/10 text-success border-success/20" :
                          status === "cooling" ? "bg-warn/10 text-warn border-warn/20" :
                          "bg-danger/10 text-danger border-danger/20"
                        }>
                          {status}
                        </Badge>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {n.forward_calls_to ? (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <PhoneForwarded className="h-3.5 w-3.5 text-success" /> {n.forward_calls_to}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Voicemail className="h-3.5 w-3.5" /> Voicemail
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      </SettingsShell>
    </div>
  );
}

/** Leads call back the numbers that text them: forward or send to voicemail. */
function InboundCallCard({
  workspaceId,
  canManage,
  unforwarded,
  total,
  currentForward,
  currentGreeting,
  recordingEnabled = false,
  recordingDisclosure = false,
}: {
  workspaceId: string | null;
  canManage: boolean;
  unforwarded: number;
  total: number;
  currentForward: string;
  currentGreeting: string;
  recordingEnabled?: boolean;
  recordingDisclosure?: boolean;
}) {
  const save = useServerFn(updateInboundSettings);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ForwardScope>("pool");
  const [forward, setForward] = useState(currentForward);
  const [greeting, setGreeting] = useState(currentGreeting);
  const [recording, setRecording] = useState(recordingEnabled);
  const [disclose, setDisclose] = useState(recordingDisclosure);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await save({
        data: {
          workspaceId,
          scope,
          forwardCallsTo: forward.trim() ? forward.trim() : null,
          voicemailGreeting: withDisclosure(greeting, recording && disclose) || null,
          recordingEnabled: recording,
          recordingDisclosure: disclose,
        },
      });
      toast.success(forward.trim() ? "Inbound Calls Will Forward." : "Inbound Calls Go To Voicemail.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["numbers", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Save Inbound Settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
        <PhoneForwarded className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1">
          <div className="font-display font-bold text-foreground">Inbound Call Handling</div>
          <div className="text-sm text-muted-foreground">
            {currentForward ? (
              <>
                Calls To Your Pool Forward To {currentForward}. Unanswered Calls Leave A Voicemail With A Transcript In Your Inbox.
              </>
            ) : (
              <>
                Leads Will Call The Numbers That Text Them. Forward Those Calls To Your Phone, Or Let Voicemail Catch Them.
                <br />
                Recordings And Transcripts Land In Your Inbox.
              </>
            )}
          </div>
          {total > 0 && unforwarded > 0 && (
            <div className="mt-1 text-xs text-warn">
              {unforwarded} Of {total} Number{total === 1 ? "" : "s"} Currently Send Callers Straight To Voicemail.
            </div>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={!canManage}
              title={canManage ? undefined : "Only Admins Can Change Inbound Call Handling"}
            >
              Configure
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Inbound Call Handling</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Apply Forwarding To</Label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ForwardScope)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {FORWARD_SCOPES.map((s) => (
                    <option key={s.value} value={s.value} disabled={!s.available}>
                      {s.label}
                      {s.available ? "" : " (Coming Soon)"}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {FORWARD_SCOPES.find((s) => s.value === scope)?.hint}
                </p>
              </div>
              <div>
                <Label>Forward Calls To</Label>
                <Input
                  placeholder="(555) 123-4567"
                  value={forward}
                  onChange={(e) => setForward(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Applies To Every Number In Your Pool Today. Leave Blank To Use Voicemail Only.
                </p>
              </div>
              <div>
                <Label>Voicemail Greeting</Label>
                <Textarea
                  rows={3}
                  placeholder="Thanks for calling — leave your name and number and we'll text you right back."
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Used When A Call Isn't Answered. Recordings And Transcripts Appear In The Inbox On The Lead's Thread.
                </p>
              </div>

              {/* Recording is a second regulatory surface (wiretap law), separate from TCPA. */}
              <div className="rounded-xl border border-warn/40 bg-warn/5 p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-foreground">Record Inbound Calls</div>
                    <p className="mt-1 text-xs text-muted-foreground">{RECORDING_CONSENT_NOTICE}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      All-Party Consent States Commonly Include: {ALL_PARTY_CONSENT_STATES.join(", ")}. Have Counsel Review
                      Your Disclosure Before Enabling Recording Broadly. This Is Not Legal Advice.
                    </p>
                    <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={recording}
                        onChange={(e) => setRecording(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Record Calls And Generate Transcripts
                    </label>
                    <label className="mt-1.5 flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={disclose}
                        disabled={!recording}
                        onChange={(e) => setDisclose(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      Add A Recording Disclosure To The Greeting
                    </label>
                    {recording && disclose && (
                      <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                        Callers Will Hear: “{RECORDING_DISCLOSURE_LINE}”
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={busy} className="rounded-full">
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save Settings
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
        <div className={`mt-2 font-display text-3xl font-black ${tone === "success" ? "text-success" : "text-foreground"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
/**
 * Per-DID daily cap. Rate limiting is enforced per number, not per campaign, so
 * this throttles the number everywhere it is used. An override can only lower
 * the warmup ceiling — never raise it.
 */
function DailyCapCell({
  numberId,
  cap,
  override,
  paused,
  canManage,
  onSaved,
}: {
  numberId: string;
  cap: number;
  override: number | null;
  paused: boolean;
  canManage: boolean;
  onSaved: () => void;
}) {
  const save = useServerFn(updateNumberLimits);
  const [value, setValue] = useState(override ? String(override) : "");
  const [busy, setBusy] = useState(false);

  async function commit(next: string, resume = false) {
    const parsed = next.trim() === "" ? null : Number(next);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
      toast.error("Enter a daily cap of at least 1, or clear it to use the warm-up limit.");
      return;
    }
    setBusy(true);
    try {
      await save({ data: { numberId, dailyCapOverride: parsed, resume } });
      onSaved();
      toast.success(resume ? "Number back in rotation." : "Daily cap saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const current = override ? String(override) : "";
          if (value.trim() !== current) void commit(value);
        }}
        placeholder={String(cap)}
        inputMode="numeric"
        aria-label="Daily send cap for this number"
        className="h-8 w-20"
        disabled={busy || !canManage}
        title={canManage ? undefined : "Only Admins Can Change Send Throttles"}
      />
      <span className="text-xs text-muted-foreground">/ {cap.toLocaleString()}</span>
      {paused ? (
        <Button size="sm" variant="outline" disabled={busy || !canManage} onClick={() => void commit(value, true)}>
          Resume
        </Button>
      ) : null}
    </div>
  );
}
