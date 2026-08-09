import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import type { IndustryLanding } from "@/lib/industry-landings";

export function IndustryLandingPage({ data }: { data: IndustryLanding }) {
  const Icon = data.icon;
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="bg-background pt-16 pb-20">
        <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground/80">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {data.hero.eyebrow}
            </div>
            <h1 className="mt-6 font-display text-5xl md:text-6xl font-black leading-[1.05] text-foreground">
              {data.hero.title}{" "}
              <span className="text-primary">{data.hero.highlight}</span>{" "}
              {data.hero.titleTail}
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              {data.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link to="/how-it-works">See How It Works</Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap gap-5 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> No Credit Card Required
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" /> Cancel Anytime
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="relative rounded-2xl bg-card text-card-foreground p-6 border border-border shadow-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" /> Wired To
              </div>
              <div className="mt-2 font-display font-black text-2xl">{data.wiredTo}</div>
              <div className="mt-5 rounded-xl bg-surface border border-border p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sample Message
                </div>
                <div className="mt-2 text-sm text-foreground leading-relaxed">
                  "{data.sampleMessage}"
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 border border-success/25 text-success px-3 py-2 text-sm">
                <Check className="h-4 w-4" /> DNC + Litigator Scrubbed
              </div>
            </div>
            <div className="absolute -top-4 -right-4 rounded-xl bg-ink text-ink-foreground px-4 py-2 text-sm font-semibold rotate-[3deg] shadow-lg">
              Reply Rate <span style={{ color: "#F5D547" }}>12.4%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-surface py-10 border-y border-border">
        <div className="mx-auto max-w-7xl px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {data.stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-4xl font-black text-primary">{s.value}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-background py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-3xl mx-auto">
            <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">
              Use Cases
            </div>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-black text-foreground leading-tight">
              Built For How {data.industry} Actually Works.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-12">
            {data.useCases.map((u) => (
              <div key={u.title} className="rounded-2xl border border-border bg-surface p-6">
                <div className="font-display font-bold text-lg text-foreground">{u.title}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-surface-muted py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-3xl mx-auto">
            <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">
              Why {data.industry} Pros Pick LeadTrace
            </div>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-black text-foreground leading-tight">
              Everything You Need. Nothing You Don't.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
            {data.benefits.map((b) => (
              <div key={b.title} className="rounded-2xl border border-border bg-surface p-6">
                <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
                  <b.icon className="h-5 w-5" />
                </div>
                <div className="mt-4 font-display font-bold text-foreground">{b.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-background py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-3xl mx-auto">
            <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">
              Who It's For
            </div>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-black text-foreground leading-tight">
              Built For The Way You Work.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-12">
            {data.audiences.map((a) => (
              <div key={a.title} className="rounded-2xl border border-border bg-surface p-6">
                <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
                  <a.icon className="h-5 w-5" />
                </div>
                <div className="mt-4 font-display font-bold text-foreground">{a.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-background pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rounded-3xl bg-primary text-primary-foreground p-12 md:p-16 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-black leading-tight lg:whitespace-nowrap">
              Ready To Fill Your {data.industry} Pipeline?
            </h2>
            <p className="mt-4 text-primary-foreground/80 max-w-2xl mx-auto">
              Start free. Upgrade when the leads start closing. No card required.
            </p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg" variant="secondary" className="rounded-full">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create Your Account <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}