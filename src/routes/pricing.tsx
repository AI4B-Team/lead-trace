import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check, Star, Gauge, Shield, Repeat, Users, Phone } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Replace Your Whole Lead Stack | LeadTrace" },
      { name: "description", content: "Sending numbers, managed number pools, lead credits, DNC and litigator scrubbing, and flat-rate SMS on every plan. Free 10DLC registration, no contracts, 20% off annual billing." },
      { property: "og:title", content: "LeadTrace Pricing" },
      { property: "og:description", content: "One login instead of four. Flat SMS pricing on every tier, free 10DLC registration, and managed number pools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/pricing" }],
  }),
  component: Pricing,
});

const EVERY_PLAN = [
  "Lead Generation From Multiple Data Sources",
  "Upload And Clean Your Existing Lists",
  "Mobile Verification On Every Record",
  "DNC And Litigator Compliance Checks",
  "Managed Number Pools With Smart Rotation",
  "Free 10DLC Brand And Campaign Registration",
  "Launch SMS Campaigns With Drip Sequences",
  "CSV Export And Full Audit Trail",
] as const;

const TIERS = [
  {
    name: "Starter",
    price: 97,
    for: "Perfect For Solo Operators.",
    metric: "2,500 Lead Credits / Mo",
    cta: "Start Free",
    to: "/start" as const,
    featured: false,
    included: [
      ["1", "User Seat"],
      ["5", "Sending Numbers Included"],
      ["Free", "10DLC Brand & Campaign Registration"],
      ["Email", "Support"],
    ],
    usage: [
      ["$0.012", "Per SMS Segment — Flat, Never Multiplied"],
      ["$20", "Per 1,000 Lead Credit Overage"],
      ["$0.06", "Per Skip Trace Lookup (Optional)"],
      ["$1.50", "Per Additional Number / Mo, No Cap"],
    ],
  },
  {
    name: "Growth",
    price: 197,
    for: "For Growing Sales Teams Running Outreach Every Day.",
    metric: "8,000 Lead Credits / Mo",
    cta: "Start Growing",
    to: "/start" as const,
    featured: true,
    included: [
      ["5", "User Seats"],
      ["15", "Sending Numbers Included"],
      ["Included", "Skip Tracing — 300 / Day, 3,000 / Mo"],
      ["Free", "10DLC Brand & Campaign Registration"],
      ["Priority", "Support & Processing Queue"],
    ],
    usage: [
      ["$0.011", "Per SMS Segment — Flat, Never Multiplied"],
      ["$18", "Per 1,000 Lead Credit Overage"],
      ["$0.05", "Per Skip Trace Beyond Your Included Limits"],
      ["$1.50", "Per Additional Number / Mo, No Cap"],
    ],
  },
  {
    name: "Scale",
    price: 497,
    for: "Built For Agencies And High-Volume Operations.",
    metric: "20,000 Lead Credits / Mo",
    cta: "Talk To Sales",
    to: "/start" as const,
    featured: false,
    included: [
      ["Unlimited", "User Seats"],
      ["50", "Sending Numbers Included"],
      ["Included", "Skip Tracing — 1,000 / Day, 10,000 / Mo"],
      ["Free", "10DLC Brand & Campaign Registration"],
      ["Dedicated", "Account Manager"],
    ],
    usage: [
      ["$0.010", "Per SMS Segment — Flat, Never Multiplied"],
      ["$15", "Per 1,000 Lead Credit Overage"],
      ["$0.04", "Per Skip Trace Beyond Your Included Limits"],
      ["$1.50", "Per Additional Number / Mo, No Cap"],
    ],
  },
] as const;

const TRUST = [
  "Cancel Anytime",
  "No Long-Term Contracts",
  "Trial Without A Card",
  "20% Off Annual Billing",
] as const;

const ATTACK_LINES = [
  {
    icon: Phone,
    title: "Flat SMS Price On Every Tier",
    body: "One segment costs one segment. We never double-charge credits on the cheapest plan the way texting-only tools do.",
  },
  {
    icon: Shield,
    title: "$0 In 10DLC Registration Fees",
    body: "Brand and campaign registration is free on all plans. Competitors bill $50 or more to get you sending.",
  },
  {
    icon: Repeat,
    title: "We Manage The Number Pool",
    body: "Sends rotate across your pool automatically, with per-number health monitoring, auto-cooldown, and local-presence matching.",
  },
  {
    icon: Users,
    title: "Seats Included, Not Upsold",
    body: "Growth includes five seats and Scale is unlimited, so your team shares one workspace and one audit trail.",
  },
] as const;

const STACK = [
  ["Scraping Tool", 299],
  ["Texting Tool", 35],
  ["Landline Removal", 29],
  ["DNC Scrub Service", 49],
  ["Extra Sending Numbers", 25],
] as const;

const STACK_TOTAL = STACK.reduce((sum, [, v]) => sum + v, 0);

const FAQ = [
  {
    q: "How Do Lead Credits Work?",
    a: "One credit covers one record pulled from a data source during a run. Credits included with your plan reset monthly, and you can top up at any time without changing plans.",
  },
  {
    q: "What Counts As A Skip Trace?",
    a: "A skip trace is one lookup that appends contact details — mobile numbers and emails — to a record you already have. On Growth and Scale it is included with fair-use limits: 300 lookups a day and 3,000 a month on Growth, 1,000 a day and 10,000 a month on Scale. Anything past that is metered at your plan rate, and Starter is metered from the first lookup.",
  },
  {
    q: "Can I Upload My Own Lists?",
    a: "Yes, on every plan. Uploaded lists run the same pipeline as generated ones: deduplication, mobile verification, DNC and litigator scrubbing, and skip trace.",
  },
  {
    q: "Are SMS Messages Included?",
    a: "Sending numbers are included with your plan. Message volume is metered separately at carrier pass-through rates so you never pay for messages you do not send.",
  },
  {
    q: "Can I Upgrade Anytime?",
    a: "Yes. Upgrades take effect immediately and are prorated. Downgrades apply at the start of your next billing period.",
  },
  {
    q: "Do Unused Credits Roll Over?",
    a: "Plan credits reset each billing period. Credits you purchase as top-ups never expire, so buying extra is never wasted.",
  },
  {
    q: "How Do Number Pools Work?",
    a: "Each campaign attaches a pool of sending numbers — five by default, any size you want. Sends rotate across the pool, degrading numbers cool down automatically and get backfilled, and we match local area codes to recipients where possible.",
  },
  {
    q: "What Does Annual Billing Save?",
    a: "Annual billing takes 20% off every tier. Metered usage — SMS, lead overage, skip trace beyond your included limits, additional numbers — stays at the same published rate.",
  },
] as const;

function Pricing() {
  const [annual, setAnnual] = useState(false);
  const priceFor = (monthly: number) => (annual ? Math.round(monthly * 0.8) : monthly);
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">Pricing</div>
          <h1 className="mt-3 font-display text-5xl font-black text-foreground leading-tight">
            Plans That Scale With You.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to generate, clean, verify, and launch outreach from one platform.
          </p>
          <p className="mt-2 text-muted-foreground">
            Choose the plan that matches your team. Usage scales with credits — not hidden feature limits.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-2.5">
            <span className={`text-sm font-medium ${annual ? "text-muted-foreground" : "text-foreground"}`}>
              Monthly
            </span>
            <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Toggle annual billing" />
            <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
              Annual
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              Save 20%
            </span>
          </div>
        </div>

        <div className="mt-12 mx-auto max-w-4xl rounded-2xl border border-border bg-surface-muted p-8">
          <h2 className="text-center font-display text-2xl font-black text-foreground">Every Plan Includes</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {EVERY_PLAN.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="text-foreground">{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            The plans below only change what scales: seats, sending numbers, processing speed, support, and
            monthly usage credits.
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            One lead credit = one record fully processed: sourcing, normalization, deduplication, line-type
            lookup, and DNC plus litigator scrubbing. Skip tracing is included on Growth and Scale within
            daily and monthly fair-use limits, and metered beyond them.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-14 items-start">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-8 ${t.featured ? "border-primary bg-surface shadow-2xl md:scale-[1.03]" : "border-border bg-surface"}`}
            >
              {t.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-1.5 text-sm font-bold text-primary-foreground shadow-lg whitespace-nowrap">
                  <Star className="h-4 w-4 fill-current" /> Most Popular
                </div>
              )}
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t.name}</div>
              <div className="mt-3 font-display text-5xl font-black text-foreground">
                ${priceFor(t.price)}
                <span className="text-base font-medium text-muted-foreground">/mo</span>
              </div>
              {annual && (
                <div className="mt-1 text-xs font-medium text-muted-foreground">
                  Billed Annually · ${priceFor(t.price) * 12}/Yr
                </div>
              )}
              <div className="mt-2 text-sm text-muted-foreground">{t.for}</div>

              <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-4 py-3">
                <Gauge className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-bold text-foreground">{t.metric}</span>
              </div>

              <Button asChild className="mt-5 w-full rounded-full" variant={t.featured ? "default" : "outline"}>
                <Link to={t.to}>{t.cta}</Link>
              </Button>

              <div className="mt-8">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Included
                </div>
                <ul className="mt-3 space-y-3">
                  {t.included.map(([v, k]) => (
                    <li key={k} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">{v}</span> {k}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Usage-Based
                </div>
                <ul className="mt-3 space-y-3">
                  {t.usage.map(([v, k]) => (
                    <li key={k} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">{v}</span> {k}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {TRUST.map((t) => (
            <span key={t} className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Check className="h-4 w-4 text-success" /> {t}
            </span>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">No Credit Card Required To Start</p>

        <div className="mx-auto mt-20 max-w-5xl">
          <h2 className="text-center font-display text-3xl font-black text-foreground">
            Why Our Pricing Is Different
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {ATTACK_LINES.map((a) => (
              <div key={a.title} className="rounded-2xl border border-border bg-surface p-6">
                <a.icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                <h3 className="mt-4 font-display text-lg font-bold text-foreground">{a.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-border bg-surface-muted p-8">
          <h2 className="text-center font-display text-2xl font-black text-foreground">
            The Stack You Are Replacing
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-6">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Typical Stack · Four Logins
              </div>
              <ul className="mt-4 space-y-2">
                {STACK.map(([label, cost]) => (
                  <li key={label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">${cost}/mo</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="font-display text-2xl font-black text-foreground">${STACK_TOTAL}+/mo</span>
              </div>
            </div>
            <div className="rounded-xl border border-primary bg-surface p-6">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-primary">
                LeadTrace Growth · One Login
              </div>
              <ul className="mt-4 space-y-2">
                {[
                  "Multi-Source Lead Generation",
                  "Mobile Verification & Landline Removal",
                  "DNC & Litigator Scrubbing",
                  "SMS Campaigns With Drip Sequences",
                  "15 Sending Numbers, Managed Pool",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="font-display text-2xl font-black text-primary">$197/mo</span>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Same pipeline, one bill, one audit trail. Metered usage is published above and never marked up twice.
          </p>
        </div>

        <div className="mx-auto mt-20 max-w-3xl">
          <h2 className="text-center font-display text-3xl font-black text-foreground">
            Pricing Questions, Answered
          </h2>
          <Accordion type="single" collapsible className="mt-8">
            {FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left font-display font-bold">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </MarketingLayout>
  );
}