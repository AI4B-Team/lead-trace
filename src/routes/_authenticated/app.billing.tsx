import { createFileRoute } from "@tanstack/react-router";
import { ledgerReasonLabel, refundClassOf, DEFAULT_REFUND_EMAIL_THRESHOLD } from "@/lib/refunds.shared";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { SettingsShell } from "@/components/app/settings-shell";
import { StatTile } from "@/components/app/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { useSuperAdminGate } from "@/components/app/admin-shared";
import { getBilling, topUpCredits, setRefundEmailThreshold } from "@/lib/billing.functions";
import {
  annualMonthly,
  annualTotal,
  chargesPlatformFee,
  CREDIT_PACKS,
  extraNumbersCost,
  formatUsd,
  isPastDue,
  overageCost,
  packPrice,
  planFor,
  SELLABLE_PLANS,
  type CreditKind,
} from "@/lib/plans.shared";

const CREDIT_KINDS: CreditKind[] = ["scrape", "skip_trace", "sms"];

const PLAN_CHANGE_NOTE =
  "Checkout Is Not Connected Yet — Plan Changes Are Handled By Support Until Payments Go Live.";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({ meta: [{ title: "Billing — LeadTrace" }] }),
  component: Billing,
});

function Billing() {
  const { workspaceId } = useWorkspaceId();
  const fetchBilling = useServerFn(getBilling);
  const runTopUp = useServerFn(topUpCredits);
  const qc = useQueryClient();
  const [topUpKind, setTopUpKind] = useState<CreditKind | null>(null);
  const saveThreshold = useServerFn(setRefundEmailThreshold);
  const [threshold, setThreshold] = useState<string>("");
  // Credits can only be granted by platform staff until checkout is live, so
  // customers see a support note instead of a button that would 403.
  const adminGate = useSuperAdminGate();
  const canGrantCredits = !!adminGate.data?.isSuperAdmin;

  const { data } = useQuery({
    queryKey: ["billing", workspaceId],
    queryFn: () => fetchBilling({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const mutate = useMutation({
    mutationFn: (input: { kind: CreditKind; amount: number }) =>
      runTopUp({ data: { workspaceId: workspaceId!, ...input } }),
    onSuccess: () => {
      toast.success("Credits Added");
      qc.invalidateQueries({ queryKey: ["billing", workspaceId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setTopUpKind(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balances = data?.balances;
  const totalCredits =
    (balances?.scrape ?? 0) + (balances?.skip_trace ?? 0) + (balances?.sms ?? 0);
  // Usage is measured against the workspace's real billing period, which is
  // what the renewal job resets — not the calendar month.
  const periodStart = data?.workspace?.plan_period_start
    ? new Date(data.workspace.plan_period_start)
    : (() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      })();
  const monthLedger = (data?.ledger ?? []).filter(
    (r) => new Date(r.created_at) >= periodStart && r.delta < 0,
  );
  const usedThisMonth = monthLedger.reduce((sum, r) => sum + Math.abs(r.delta), 0);
  const usageByKind = monthLedger.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + Math.abs(r.delta);
    return acc;
  }, {});
  const renewDate = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  const renewLabel = renewDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const plan = planFor(data?.workspace?.billing_plan);
  const pastDue = isPastDue(data?.workspace?.billing_plan);
  const feeCharged = chargesPlatformFee(data?.workspace?.billing_plan);
  const leadsUsed = usageByKind["scrape"] ?? 0;
  const allowancePct = plan.leadCredits
    ? Math.min(100, Math.round((leadsUsed / plan.leadCredits) * 100))
    : 0;
  const numbers = data?.numbers ?? 0;
  const seats = data?.seats ?? 0;
  const overage = overageCost(plan, leadsUsed);
  const numbersFee = extraNumbersCost(plan, numbers);

  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current="billing">
      <PageHeader title="Billing" description="Plan, Metered Credits, And Recent Activity." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Current Plan"
          value={plan.name}
          hint={feeCharged ? `${formatUsd(plan.monthly)} / Mo Platform Fee` : "No Platform Fee"}
        />
        <StatTile
          label="Total Credits"
          value={totalCredits.toLocaleString()}
          hint="Lead Credits + Skip Trace + SMS"
        />
        <StatTile
          label="Renews"
          value={renewLabel}
          hint={pastDue ? "Payment Past Due" : "Monthly Allowance Resets"}
        />
        <StatTile
          label="Used This Month"
          value={usedThisMonth.toLocaleString()}
          hint={`${data?.ledger.length ?? 0} Ledger Entries`}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-display">Current Plan</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              {data?.workspace?.name ?? "Workspace"} · {plan.name} · {plan.blurb}
            </div>
          </div>
          <Badge variant={pastDue ? "destructive" : "default"}>
            {pastDue ? "Past Due" : plan.name}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Lead Credits Used This Month</span>
              <span className="font-display font-bold tabular-nums">
                {leadsUsed.toLocaleString()}
                {plan.leadCredits > 0 ? ` / ${plan.leadCredits.toLocaleString()}` : ""}
              </span>
            </div>
            <Progress value={allowancePct} />
            <div className="mt-1 text-xs text-muted-foreground">
              {plan.leadCredits === 0
                ? "This Plan Has No Included Allowance — Every Record Draws From Credits."
                : overage > 0
                  ? `Overage This Month ${formatUsd(overage)} At ${formatUsd(plan.overagePer1k)} Per 1,000`
                  : `Overage Beyond Your Allowance Is ${formatUsd(plan.overagePer1k)} Per 1,000`}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <PlanFact
              label="Sending Numbers"
              value={`${numbers} / ${plan.numbersIncluded}`}
              hint={
                numbersFee > 0
                  ? `${formatUsd(numbersFee)} / Mo For Extra Numbers`
                  : "Included In Your Plan"
              }
            />
            <PlanFact
              label="Seats"
              value={plan.seats === null ? `${seats} / Unlimited` : `${seats} / ${plan.seats}`}
              hint="Team Members In This Workspace"
            />
            <PlanFact
              label="SMS Rate"
              value={`$${plan.smsPerSegment.toFixed(3)}`}
              hint="Per Segment — Flat, Never Multiplied"
            />
          </div>
          <p className="text-xs text-muted-foreground">{PLAN_CHANGE_NOTE}</p>
        </CardContent>
      </Card>

      <PlanPicker currentPlanId={plan.id} />

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {CREDIT_KINDS.map((k) => (
          <CreditCard
            key={k}
            label={CREDIT_PACKS[k].label}
            balance={data?.balances[k] ?? 0}
            rate={`${formatUsd(CREDIT_PACKS[k].pricePerThousand)} / 1,000 ${CREDIT_PACKS[k].unit}`}
            onTopUp={canGrantCredits ? () => setTopUpKind(k) : null}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-display">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.ledger.length ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No credit activity yet. Run a job or top up to see entries here.
            </div>
          ) : (
            <div className="divide-y">
              {data.ledger.map((row) => (
                <div key={row.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {ledgerReasonLabel(row.kind)} · {ledgerReasonLabel(row.reason)}
                      </span>
                      {refundClassOf(row.reason) === "source" && (
                        <Badge variant="outline" className="text-[10px]">Source Failure</Badge>
                      )}
                      {refundClassOf(row.reason) === "skip" && (
                        <Badge variant="outline" className="text-[10px]">Records Skipped</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className={`font-mono font-semibold ${row.delta >= 0 ? "text-success" : "text-foreground"}`}>
                    {row.delta >= 0 ? "+" : ""}
                    {row.delta.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">Refund Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Every refund shows up in your notifications and credit history. Refunds above this
                size also get an email.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="w-28"
                  value={
                    threshold !== ""
                      ? threshold
                      : String(data?.workspace?.refund_email_threshold ?? DEFAULT_REFUND_EMAIL_THRESHOLD)
                  }
                  onChange={(e) => setThreshold(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">credits</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto rounded-full"
                  onClick={() => {
                    const n = Number(threshold);
                    if (!Number.isFinite(n) || n < 1) return toast.error("Enter a credit amount");
                    saveThreshold({ data: { workspaceId: workspaceId!, threshold: Math.round(n) } })
                      .then(() => {
                        toast.success("Refund Email Threshold Saved");
                        qc.invalidateQueries({ queryKey: ["billing", workspaceId] });
                      })
                      .catch((e: Error) => toast.error(e.message));
                  }}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="grid h-9 w-12 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-bold uppercase tracking-wider">
                  Card
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">No Card On File</div>
                  <div className="text-xs text-muted-foreground">Add One Before Your Trial Ends</div>
                </div>
              </div>
              <Button variant="outline" className="w-full rounded-full" disabled>
                Add Payment Method
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Invoices Appear Here After Your First Paid Cycle.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">Usage This Month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {CREDIT_KINDS.map((k) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{CREDIT_PACKS[k].label}</span>
                  <span className="font-display font-bold tabular-nums">
                    {(usageByKind[k] ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <TopUpDialog
        kind={topUpKind}
        onClose={() => setTopUpKind(null)}
        onConfirm={(amount) => topUpKind && mutate.mutate({ kind: topUpKind, amount })}
        pending={mutate.isPending}
      />
      </SettingsShell>
    </div>
  );
}

function CreditCard({
  label,
  balance,
  rate,
  onTopUp,
}: {
  label: string;
  balance: number;
  rate: string;
  onTopUp: (() => void) | null;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
        <div className="mt-2 font-display text-3xl font-black text-foreground">{balance.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground mt-1">{rate}</div>
        {onTopUp ? (
          <Button className="w-full rounded-full mt-4" onClick={onTopUp}>
            Top Up
          </Button>
        ) : (
          <div className="mt-4 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
            Checkout Is Not Connected Yet — Contact Support To Add Credits.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlanFact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

/**
 * Tier comparison in-app. Selection is intentionally inert until a payment
 * provider is connected — a button that looks live but silently does nothing
 * is worse than one that says why it is waiting.
 */
function PlanPicker({ currentPlanId }: { currentPlanId: string }) {
  const [annual, setAnnual] = useState(false);
  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-display">Plans</CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">
            Platform Fee Only — Skip Trace And SMS Are Always Metered Separately.
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className={annual ? "text-muted-foreground" : "font-medium"}>Monthly</span>
          <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Annual Billing" />
          <span className={annual ? "font-medium" : "text-muted-foreground"}>Annual −20%</span>
        </label>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {SELLABLE_PLANS.map((p) => {
          const current = p.id === currentPlanId;
          const monthly = annual ? annualMonthly(p.monthly) : p.monthly;
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-4 ${current ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-bold">{p.name}</span>
                {current && <Badge variant="outline">Current</Badge>}
              </div>
              <div className="mt-2 font-display text-3xl font-black">
                ${monthly}
                <span className="text-sm font-medium text-muted-foreground"> / Mo</span>
              </div>
              {annual && (
                <div className="text-xs text-muted-foreground">
                  Billed Annually · ${annualTotal(p.monthly).toLocaleString()} / Yr
                </div>
              )}
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                <li>{p.leadCredits.toLocaleString()} Lead Credits / Mo</li>
                <li>{p.numbersIncluded} Sending Numbers Included</li>
                <li>{p.seats === null ? "Unlimited Seats" : `${p.seats} Seat${p.seats > 1 ? "s" : ""}`}</li>
                <li>${p.smsPerSegment.toFixed(3)} Per SMS Segment</li>
                <li>
                  {p.skipTrace.includedPerMonth > 0
                    ? `Skip Trace ${p.skipTrace.includedPerDay.toLocaleString()} / Day Included`
                    : `Skip Trace Metered At $${p.skipTrace.meteredRate.toFixed(2)}`}
                </li>
              </ul>
              <Button variant="outline" className="mt-4 w-full rounded-full" disabled>
                {current ? "Current Plan" : "Contact Support"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TopUpDialog({
  kind,
  onClose,
  onConfirm,
  pending,
}: {
  kind: CreditKind | null;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  pending: boolean;
}) {
  const [amount, setAmount] = useState<number>(1000);
  if (!kind) return null;
  const meta = CREDIT_PACKS[kind];
  const price = packPrice(kind, amount);
  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Top Up {meta.label} Credits</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            {meta.presets.map((p: number) => (
              <Button
                key={p}
                type="button"
                variant={amount === p ? "default" : "outline"}
                className="rounded-full flex-1"
                onClick={() => setAmount(p)}
              >
                {p.toLocaleString()}
              </Button>
            ))}
          </div>
          <div>
            <Label htmlFor="custom">Custom Amount</Label>
            <Input
              id="custom"
              type="number"
              min={100}
              value={amount}
              onChange={(e) => setAmount(Math.max(100, Number(e.target.value) || 0))}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {amount.toLocaleString()} {meta.unit} At {formatUsd(meta.pricePerThousand)} / 1,000
            </span>
            <span className="font-display text-lg font-bold">{formatUsd(price)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Platform grant: credits are added instantly and recorded in the ledger. Customer
            self-serve top-ups unlock when checkout goes live.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(amount)} disabled={pending}>
            {pending ? "Adding…" : `Add ${amount.toLocaleString()} Credits`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}