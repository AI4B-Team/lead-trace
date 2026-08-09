import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ShieldCheck,
  Check,
  Search,
  Landmark,
  Upload,
  UserSearch,
  MessageSquare,
  Activity,
  Lock,
  ArrowRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  Settings2,
  Rocket,
} from "lucide-react";
import { MarketingNav, ComplianceStrip, MarketingFooter } from "@/components/marketing/marketing-layout";
import { PromptHero } from "@/components/marketing/prompt-hero";
import { TemplateCard } from "@/components/marketing/template-card";
import { TEMPLATES, featuredTemplates, getTemplate, type Template } from "@/lib/templates";
import { IndustryPreview } from "@/components/marketing/industry-preview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LeadTrace — Stop Buying Lists. Start Closing Deals." },
      { name: "description", content: "Find them, trace them, scrub them, text them — automatically. Describe who you want to reach; LeadTrace builds the campaign." },
      { property: "og:title", content: "LeadTrace — Stop Buying Lists. Start Closing Deals." },
      { property: "og:description", content: "Find them, trace them, scrub them, text them — automatically. Describe who you want to reach; LeadTrace builds the campaign." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { prompt?: string; template?: string } => ({
    ...(typeof search.prompt === "string" ? { prompt: search.prompt } : {}),
    ...(typeof search.template === "string" ? { template: search.template } : {}),
  }),
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  // Template selection is context, never composer text: the hero only swaps its
  // placeholder hint and carries the id through the auth handoff.
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    () => (search.template ? getTemplate(search.template) ?? null : null),
  );
  const toggleTemplate = (t: Template) => {
    setSelectedTemplate((cur) => (cur?.id === t.id ? null : t));
    document
      .getElementById("prompt-hero-box")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      {/* Hero + template grid are one continuous white band that fills the
          viewport, so the dark section below only appears on scroll. */}
      <div className="flex min-h-screen flex-col bg-background">
        <PromptHero selectedTemplate={selectedTemplate} />
        <TemplateTeaser selectedId={selectedTemplate?.id ?? null} onSelect={toggleTemplate} />
      </div>
      <ConsolidationBand />
      <HowItWorksSection />
      <FeaturesSection />
      <IndustriesSection />
      <PricingPreview />
      <ComplianceStrip />
      <MarketingFooter />
    </div>
  );
}

function TemplateTeaser({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (t: Template) => void;
}) {
  const [offset, setOffset] = useState(0);
  const displayTemplates = useMemo(() => featuredTemplates(), []);
  const [order, setOrder] = useState(() => displayTemplates.map((_, i) => i));
  const pageSize = 6;
  const visible = useMemo(() => {
    const arr: typeof TEMPLATES = [];
    for (let i = 0; i < pageSize; i++) {
      arr.push(displayTemplates[order[(offset + i) % order.length]]);
    }
    return arr;
  }, [offset, order, displayTemplates]);

  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setOffset(0);
  };

  return (
    <section className="bg-background pt-5 pb-16 md:pt-8">
      <div className="mx-auto max-w-[77.5rem] px-6">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div className="flex flex-col items-start gap-1">
            <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">
              Not Sure Where To Start? Try One Of These…
            </h2>
            <Link to="/templates" className="text-sm font-semibold text-primary hover:underline">
              View All Templates →
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shuffle}
              className="grid place-items-center h-9 w-9 rounded-full border border-border bg-surface hover:bg-surface-muted"
              aria-label="Shuffle Templates"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => (o - pageSize + order.length) % order.length)}
              className="grid place-items-center h-9 w-9 rounded-full border border-border bg-surface hover:bg-surface-muted"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => (o + pageSize) % order.length)}
              className="grid place-items-center h-9 w-9 rounded-full border border-border bg-surface hover:bg-surface-muted"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((t, i) => (
            <TemplateCard
              key={`${t.id}-${i}`}
              template={t}
              variant="prompt"
              large
              selected={selectedId === t.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ConsolidationBand() {
  return (
    <section className="bg-ink text-ink-foreground py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-2 gap-14 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-[0.18em]">
            <Sparkles className="h-3.5 w-3.5" />
            One Platform, Not Four Tools
          </div>
          <h2 className="mt-6 font-display text-5xl md:text-6xl font-black leading-[1.05] text-ink-foreground">
            Four Tools.
            <br />
            One Login.
          </h2>
          <p className="mt-6 text-lg text-ink-muted max-w-lg">
            LeadTrace scrapes your leads, verifies their contact info, scrubs them clean, and launches
            your campaign. One platform replaces your scraper, your skip tracer, your DNC service, and
            your texting tool.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/start">
                Start Your 14-Day Free Trial <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-6 text-sm text-ink-muted">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> No Credit Card Required
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" /> 14-Day Free Trial
            </span>
          </div>
        </div>
        <div className="relative">
          <div className="flex gap-2 mb-4">
            {["Business", "Records", "Upload"].map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/20 bg-white/5 text-ink-foreground/90 px-3 py-1 text-xs font-medium"
              >
                {s}
              </span>
            ))}
          </div>
          <div className="relative rounded-2xl bg-white text-foreground p-6 rotate-[-1.5deg] shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pipeline Status
            </div>
            <div className="mt-2 font-display font-black text-3xl">
              Traced <span className="text-primary">2,810</span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: "78%" }} />
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-success/10 border border-success/25 text-success px-3 py-2 text-sm">
              <Check className="h-4 w-4" />
              Compliance Scrub Baked In
            </div>
            <div className="absolute -top-4 -right-4 rounded-xl bg-ink text-ink-foreground px-4 py-2 text-sm font-semibold rotate-[4deg] shadow-lg">
              Reply Rate <span style={{ color: "#F5D547" }}>12.4%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      n: "Step 1",
      icon: Database,
      title: "Generate Or Import",
      body: "Generate new leads or import an existing CSV, CRM export, or lead list.",
      checks: [] as string[],
    },
    {
      n: "Step 2",
      icon: Settings2,
      title: "Clean & Verify",
      body: "Every record runs the same verification process before it reaches your outreach.",
      checks: ["Verify Contacts", "Optional Skip Trace", "Compliance Checked", "Ready To Launch"],
    },
    {
      n: "Step 3",
      icon: Rocket,
      title: "Launch Outreach",
      body: "Reach more prospects using local numbers, automated follow-ups, and built-in compliance.",
      checks: [] as string[],
    },
  ];
  return (
    <section className="bg-surface py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-7xl text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">How It Works</div>
          <h2 className="mt-3 font-display text-3xl font-black leading-tight text-foreground md:text-4xl lg:text-[2.75rem] lg:whitespace-nowrap">
            However Your Leads Start, They End Outreach-Ready.
          </h2>
          <p className="mx-auto mt-4 max-w-none text-base text-muted-foreground lg:whitespace-nowrap">
            Generate new leads, upload your own lists, or process public records — all through the same pipeline.
          </p>
        </div>
        <div className="relative mt-10 grid items-stretch gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          {steps.map((s, i) => (
            <div key={s.n} className="contents">
              <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-6 w-6" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {s.n}
                  </span>
                </div>
                <div className="mt-4 font-display text-xl font-bold text-foreground">{s.title}</div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                {s.checks.length > 0 && (
                  <ul className="stage-checks mt-4 space-y-2 border-t border-border pt-4">
                    {s.checks.map((c, ci) => (
                      <li
                        key={c}
                        className="flex items-center gap-2 text-sm text-foreground"
                        style={{ animationDelay: `${ci * 110}ms` }}
                      >
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className="flex items-center justify-center" aria-hidden="true">
                  <span className="hidden h-px w-6 bg-border md:block" />
                  <ArrowRight
                    className="arrow-nudge h-5 w-5 rotate-90 text-muted-foreground md:rotate-0"
                    style={{ animationDelay: `${i * 400}ms` }}
                  />
                  <span className="hidden h-px w-6 bg-border md:block" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  type Feature = {
    icon: typeof Search;
    title: string;
    body: string;
    chips: string[];
    featured?: boolean;
  };
  const features: Feature[] = [
    {
      icon: Search,
      title: "Business Search",
      body: "Generate targeted business lists from multiple data sources in seconds.",
      chips: ["50 States", "12+ Sources", "Built On Demand"],
      featured: true,
    },
    {
      icon: Landmark,
      title: "Public Records",
      body: "Pull probates, code violations, pre-foreclosures, tax defaults, and vacancies.",
      chips: ["County Data", "Refreshed Weekly"],
    },
    {
      icon: Upload,
      title: "Upload Your List",
      body: "Upload a CSV or CRM export and start with your own data.",
      chips: ["CSV", "CRM Export", "Field Mapping"],
    },
    {
      icon: Activity,
      title: "Contact Enrichment",
      body: "Standardize records and score list quality before you spend a credit.",
      chips: ["Dedupe", "Line Type", "Quality Score"],
    },
    {
      icon: UserSearch,
      title: "Auto Skip Trace",
      body: "Append missing phone numbers and emails when available.",
      chips: ["Phone", "Email", "Address"],
    },
    {
      icon: ShieldCheck,
      title: "List Cleaning",
      body: "DNC and litigator records removed before anything reaches your outreach.",
      chips: ["DNC", "Litigators", "Audit Proof"],
    },
    {
      icon: Lock,
      title: "SMS Compliance",
      body: "Guided 10DLC registration, quiet hours, and full audit logs.",
      chips: ["10DLC", "Quiet Hours", "Audit Logs"],
    },
    {
      icon: MessageSquare,
      title: "SMS Campaigns",
      body: "Launch compliant SMS campaigns with local numbers, number rotation, reply detection, and automated STOP handling.",
      chips: ["Local Numbers", "Number Rotation", "Reply Detection", "STOP Handling"],
      featured: true,
    },
  ];

  const FeatureCard = ({ f }: { f: Feature }) => (
    <div
      className={`rounded-2xl border bg-surface p-7 transition-colors hover:border-primary/40 ${
        f.featured ? "border-primary/30 shadow-lg md:col-span-2" : "border-border"
      }`}
    >
      <div className={`flex items-start gap-4 ${f.featured ? "md:items-center" : ""}`}>
        <span
          className={`grid shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ${
            f.featured ? "h-14 w-14" : "h-12 w-12"
          }`}
        >
          <f.icon className={f.featured ? "h-7 w-7" : "h-6 w-6"} />
        </span>
        <div className="min-w-0">
          <div
            className={`font-display font-bold text-foreground ${
              f.featured ? "text-2xl" : "text-lg"
            }`}
          >
            {f.title}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {f.chips.map((c) => (
          <span
            key={c}
            className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <section className="bg-surface-muted py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Features"
          title="Turn Raw Data Into Ready-To-Contact Leads."
          subtitle="Bring data in from anywhere, let LeadTrace clean and verify it automatically, then launch compliant outreach."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {features.map((f) => (
            <FeatureCard key={f.title} f={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function IndustriesSection() {
  return <IndustryPreview />;
}

function PricingPreview() {
  const tiers = [
    { name: "Starter", price: 97, for: "Solo Operators", featured: false },
    { name: "Growth", price: 197, for: "Teams Doing Volume", featured: true },
    { name: "Scale", price: 497, for: "High-Volume / Agencies", featured: false },
  ];
  return (
    <section className="bg-surface-muted py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading eyebrow="Pricing" title="Plans That Scale With You." />
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-8 ${t.featured ? "border-primary bg-surface shadow-xl" : "border-border bg-surface"}`}
            >
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1">
                  Most Popular
                </div>
              )}
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t.name}</div>
              <div className="mt-3 font-display text-5xl font-black text-foreground">
                ${t.price}
                <span className="text-base font-medium text-muted-foreground">/mo</span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{t.for}</div>
              <Button asChild className="mt-6 w-full rounded-full" variant={t.featured ? "default" : "outline"}>
                <Link to="/pricing">See Full Comparison</Link>
              </Button>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-8">
          All Plans Include A 30-Day Money-Back Guarantee · No Credit Card Required To Start
        </p>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl text-center">
      <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">{eyebrow}</div>
      <h2 className="mt-3 text-balance font-display text-3xl sm:text-4xl md:text-5xl font-black text-foreground leading-tight">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-pretty text-base text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
