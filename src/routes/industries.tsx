import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { INDUSTRY_LANDINGS } from "@/lib/industry-landings";
import { ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/industries")({
  head: () => ({
    meta: [
      { title: "Industries — Built For The Way You Sell. — LeadTrace" },
      { name: "description", content: "Insurance, real estate, solar, home services, and agencies all run on the same LeadTrace pipeline, tuned to their playbook." },
      { property: "og:title", content: "LeadTrace For Every Industry" },
      { property: "og:description", content: "Built for the way you sell." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Industries,
});

function Industries() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">Industries</div>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-black text-foreground leading-tight lg:whitespace-nowrap">
            Built For The Way You Sell.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Pick the playbook you run. Every industry gets tuned prompts, targeting, and outreach templates on the same compliant pipeline.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-14">
          {INDUSTRY_LANDINGS.map((i) => {
            const Icon = i.icon;
            return (
              <Link
                key={i.slug}
                to={`/${i.slug}` as string}
                className="group flex flex-col rounded-2xl border border-border bg-surface p-6 hover:border-primary hover:shadow-lg transition"
              >
                <div className="flex items-center gap-3">
                  <div className="grid place-items-center h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-display font-bold text-xl text-foreground">{i.industry}</div>
                </div>

                <p className="mt-4 text-base font-medium text-foreground">
                  {i.card.tagline}
                </p>

                <ul className="mt-4 space-y-2">
                  {i.card.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                      {b}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap gap-2">
                  {i.card.pills.map((p) => (
                    <span key={p} className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground">
                      {p}
                    </span>
                  ))}
                </div>

                <div className="mt-auto pt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
                  Explore {i.industry} <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </MarketingLayout>
  );
}
