import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOnboarding, setOnboardingPref } from "@/lib/onboarding.functions";
import { ProductTour } from "@/components/app/product-tour";
import {
  Check, ChevronDown, ChevronUp, X, Sparkles, Search, ListChecks, ShieldCheck, Phone, Send, Bot,
} from "lucide-react";

type Step = {
  key: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  to: string;
  cta: string;
  done: boolean;
};

/** Persistent activation checklist: nothing SMS-related blocks the first clean list. */
export function GettingStarted({ workspaceId }: { workspaceId: string | null }) {
  const load = useServerFn(getOnboarding);
  const save = useServerFn(setOnboardingPref);
  const qc = useQueryClient();
  const [tourOpen, setTourOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const { data } = useQuery({
    queryKey: ["onboarding", workspaceId],
    queryFn: () => load({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const mutate = useMutation({
    mutationFn: (patch: { welcomeDismissed?: boolean; checklistCollapsed?: boolean }) =>
      save({ data: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding", workspaceId] }),
  });

  if (!data) return null;

  const steps: Step[] = [
    {
      key: "search",
      title: "Run Your First Search — Or Upload A List",
      body: "Pick a niche and a county, or bring a CSV you already own.",
      icon: <Search className="h-4 w-4" />,
      to: "/app/assistant",
      cta: "Build A List",
      done: data.hasJob,
    },
    {
      key: "review",
      title: "Review Your Clean List",
      body: "See what survived dedupe, line-type filtering, DNC, and litigator scrub.",
      icon: <ListChecks className="h-4 w-4" />,
      to: "/app/lists",
      cta: "Open Lists",
      done: data.reviewedCleanList,
    },
    {
      key: "brand",
      title: "Register Your Texting Brand",
      body: "Carrier approval can take a few days — start now so it's ready when your list is.",
      icon: <ShieldCheck className="h-4 w-4" />,
      to: "/app/registration",
      cta: "Start Setup",
      done: data.hasBrand,
    },
    {
      key: "numbers",
      title: "Add Sending Numbers",
      body: "Local numbers with rotation, health monitoring, and automatic cooldown.",
      icon: <Phone className="h-4 w-4" />,
      to: "/app/numbers",
      cta: "Add Numbers",
      done: data.hasNumbers,
    },
    {
      key: "campaign",
      title: "Launch Your First Campaign",
      body: "Quiet hours, STOP handling, and litigator blocking are on by default.",
      icon: <Send className="h-4 w-4" />,
      to: "/app/campaigns/new",
      cta: "Build Campaign",
      done: data.hasCampaign,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const collapsed = data.checklistCollapsed;
  const next = steps.find((s) => !s.done);

  return (
    <>
      <ProductTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {!data.welcomeDismissed && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 text-sm">
            <span className="font-display font-bold text-foreground">Welcome to LeadTrace</span>
            <span className="text-muted-foreground">
              {" — Knock out the steps below, or "}
              <button type="button" onClick={() => setTourOpen(true)} className="font-medium text-primary underline underline-offset-2">
                take the 60-second tour →
              </button>
            </span>
          </div>
          <button
            type="button"
            aria-label="Dismiss welcome"
            onClick={() => mutate.mutate({ welcomeDismissed: true })}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-foreground">Getting Started</h2>
                <span className="text-xs font-medium text-muted-foreground">{doneCount} Of {steps.length} Complete</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(doneCount / steps.length) * 100}%` }}
                />
              </div>
              {collapsed && next && (
                <div className="mt-2 text-xs text-muted-foreground">Next: {next.title}</div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => mutate.mutate({ checklistCollapsed: !collapsed })}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>

          {!collapsed && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {doneCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDone((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/15"
                  >
                    <Check className="h-3.5 w-3.5" /> {doneCount} Completed
                    {showDone ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Remaining ({steps.length - doneCount})
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Finish Setup This Week → 500 Bonus Lead Credits.
                </span>
              </div>

              {showDone && doneCount > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {steps.filter((s) => s.done).map((s) => (
                    <li key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                      <span className="truncate line-through">{s.title}</span>
                    </li>
                  ))}
                </ul>
              )}

              <ol className="mt-3 divide-y divide-border">
                {steps.filter((s) => !s.done).map((s) => (
                  <li key={s.key} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
                    {/* Phone widths can't fit icon + copy + button in one row without
                        squeezing the text to a few words per line, so stack there. */}
                    <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center sm:gap-4">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                        {s.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{s.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{s.body}</div>
                      </div>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant={s.key === next?.key ? "default" : "outline"}
                      className="w-full rounded-full sm:w-auto sm:shrink-0"
                    >
                      <Link to={s.to}>{s.cta}</Link>
                    </Button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/**
 * Compact first-run companion for the Build page. Building a list is never
 * gated on setup — the send-side prerequisites just stay visible so nothing
 * gets skipped before launch. Dismissing it persists, after which the
 * Dashboard becomes the user's default landing surface.
 */
export function FirstRunSetup({ workspaceId }: { workspaceId: string | null }) {
  const load = useServerFn(getOnboarding);
  const save = useServerFn(setOnboardingPref);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["onboarding", workspaceId],
    queryFn: () => load({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const dismiss = useMutation({
    mutationFn: () => save({ data: { firstRunDismissed: true, workspaceId: workspaceId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", workspaceId] });
      qc.invalidateQueries({ queryKey: ["landing-target", workspaceId] });
    },
  });

  // Keyed to workspace setup completeness, not account age: an experienced user's
  // Nth workspace still starts here, and a workspace graduates once it has data.
  if (!data || !data.firstRun) return null;

  const items = [
    {
      key: "brand",
      title: "Register Your Texting Brand",
      body: "Carrier approval takes a few days — start it now.",
      icon: <ShieldCheck className="h-4 w-4" />,
      to: "/app/registration",
      done: data.hasBrand,
    },
    {
      key: "numbers",
      title: "Add A Sending Number",
      body: "Needed before any campaign can send.",
      icon: <Phone className="h-4 w-4" />,
      to: "/app/numbers",
      done: data.hasNumbers,
    },
    {
      key: "agent",
      title: "Set Up Your AI Agent",
      body: "Train it once so replies get handled for you.",
      icon: <Bot className="h-4 w-4" />,
      to: "/app/agent",
      done: data.hasAgent,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  return (
    <Card className="mb-6 border-primary/40">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="font-display text-sm font-bold text-foreground">Finish Setup Before You Launch</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Build Your First List Right Now — These Only Matter When You're Ready To Send.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss setup checklist"
            onClick={() => dismiss.mutate()}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-3 space-y-2">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3">
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                  i.done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                }`}
              >
                {i.done ? <Check className="h-4 w-4" /> : i.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${i.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {i.title}
                </div>
                {!i.done && <div className="text-xs text-muted-foreground">{i.body}</div>}
              </div>
              {!i.done && (
                <Button asChild size="sm" variant="outline" className="rounded-full shrink-0">
                  <Link to={i.to}>Set Up</Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
