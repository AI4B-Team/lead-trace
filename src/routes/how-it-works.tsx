import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Building2, CheckCircle2, MapPin, Send, ShieldCheck, Smartphone } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { LivePipeline, SCENARIOS } from "@/components/marketing/live-pipeline";
import { Button } from "@/components/ui/button";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "From Raw Data To Ready Leads | LeadTrace" },
      {
        name: "description",
        content:
          "Five verification steps turn 1,240 raw records into 554 mobile-verified, DNC-scrubbed contacts in about 90 seconds.",
      },
      { property: "og:title", content: "From Raw Data To Ready Leads — LeadTrace" },
      {
        property: "og:description",
        content: "One request. Five verification steps. A list you can text in about 90 seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/how-it-works") }],
  }),
  component: HowItWorks,
});

const STAGES = [
  {
    icon: MapPin,
    name: "Bring In Records",
    body: "Build a new list from multiple data sources or upload a list you already own.",
    time: "~15 seconds",
  },
  {
    icon: Building2,
    name: "Verify Contacts",
    body: "Remove duplicates, identify mobile and landline numbers, standardize every record, and prepare the list for the next step.",
    time: "~20 seconds",
  },
  {
    icon: Smartphone,
    name: "Fill Missing Data",
    body: "Carrier lookup identifies mobile and landline numbers. Optional skip tracing appends missing phone numbers and email addresses when available.",
    time: "~40 seconds",
  },
  {
    icon: ShieldCheck,
    name: "Clean & Comply",
    body: "Checked against the National DNC Registry and known-litigator databases before delivery.",
    time: "~15 seconds",
  },
  {
    icon: Send,
    name: "Launch Outreach",
    body: "Send campaigns from local numbers, rotate sending, and automate follow-up and STOP handling.",
    time: "When you're ready",
  },
];

function HowItWorks() {
  return (
    <MarketingLayout>
      {/* Hero + input → output transformation */}
      <section className="bg-background pt-16 pb-14">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">How It Works</div>
          <h1 className="mt-3 font-display text-4xl md:text-6xl font-black leading-[1.05] text-foreground">
            From Raw Data To Ready Leads
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Generate a new list, upload one you already have, or mix sources.
            <br />
            Every record runs the same verification pipeline and comes back ready to contact.
          </p>

          <HeroTransform />
        </div>
      </section>

      {/* Live run */}
      <section className="border-y border-border bg-surface-muted py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            Watch LeadTrace Clean A List
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            The same pipeline runs whether you built a new list or uploaded a CSV of your own. Watch it cycle
            through real scenarios.
          </p>
          <LivePipeline className="mt-8" />
        </div>
      </section>

      {/* Five steps */}
      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            Every List Follows The Same Five Steps
          </h2>
          <p className="mt-3 text-base font-semibold text-foreground">
            Raw List To Ready In About 90 Seconds.
          </p>
          <div className="mt-10 space-y-4">
            {STAGES.map((s, i) => (
              <div key={s.name}>
                <div className="flex items-start gap-5 rounded-2xl border border-border bg-surface p-6">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="font-display text-xl font-black text-foreground">
                        {i + 1}. {s.name}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {s.time}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div className="grid place-items-center py-1 text-muted-foreground/60">
                    <ArrowDown className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-start gap-3 rounded-2xl border border-primary bg-primary/5 p-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-base font-semibold text-foreground">
              Every record passes every required step before delivery — so every export meets the same
              quality standard, whether you generated the list or uploaded it.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/start">
                Build My List <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/leads">See Sample List</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

/** Cycles through input → output scenarios so the hero shows every workflow. */
function HeroTransform() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % SCENARIOS.length), 3500);
    return () => clearInterval(t);
  }, []);
  const s = SCENARIOS[i]!;
  const SourceIcon = s.sourceIcon;
  const out = s.counts[s.counts.length - 1]!;

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div key={`in-${i}`} className="animate-fade-in rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <SourceIcon className="h-3.5 w-3.5 text-primary" /> Input · Multi-Source
        </div>
        <div className="mt-3 font-display text-2xl font-black text-foreground">{s.request}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {s.counts[0]!.toLocaleString()} records received · e.g. {s.sourceLabel}
        </div>
      </div>
      <div className="grid place-items-center text-muted-foreground">
        <ArrowDown className="h-6 w-6 md:hidden" />
        <ArrowRight className="hidden h-6 w-6 md:block" />
      </div>
      <div key={`out-${i}`} className="animate-fade-in rounded-2xl border border-primary bg-primary/5 p-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-primary">Output</div>
        <div className="mt-3 font-display text-2xl font-black text-foreground">
          {out.toLocaleString()} Ready-To-Contact Records
        </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Verified · DNC Scrubbed{s.skipTrace ? " · Traced" : ""}
          </div>
      </div>
    </div>
  );
}
