import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { ShieldCheck, MessageCircleOff, FileCheck, BadgeCheck, Clock, Ban } from "lucide-react";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance — LeadTrace" },
      { name: "description", content: "DNC scrubbing on every list, automatic STOP handling, timestamped audit logs, quiet hours, and guided 10DLC registration. Non-bypassable." },
      { property: "og:title", content: "Compliance At LeadTrace" },
      { property: "og:description", content: "Built in. Non-bypassable. Selling point, not fine print." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/compliance") }],
  }),
  component: Compliance,
});

function Compliance() {
  const items = [
    { icon: ShieldCheck, title: "Scrubbing Is Baked In", body: "Every list passes DNC and litigator scrub before any send. Three output files (Clean / DNC / Litigator) generated every time." },
    { icon: Ban, title: "Only Clean Files Send", body: "The DNC and Litigator files are download-only for suppression and analytics. There is no path to text the wrong bucket." },
    { icon: MessageCircleOff, title: "Real STOP And HELP Handling", body: "Standard opt-out keywords enforced at the platform level. Opt-outs are logged with timestamp and honored across all future campaigns." },
    { icon: BadgeCheck, title: "Guided 10DLC / A2P Registration", body: "Onboarding walks you through brand and campaign registration. Sending is disabled until registration is approved." },
    { icon: FileCheck, title: "Timestamped Audit Logs", body: "Every scrub run is stored with counts and a downloadable proof record." },
    { icon: Clock, title: "Quiet Hours + Daily Throttles", body: "Enforced server-side by recipient time zone. New numbers ramp on a warm-up curve." },
  ];
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">Compliance</div>
        <h1 className="mt-3 font-display text-5xl font-black text-foreground leading-tight max-w-3xl">
          Compliance Is Not Fine Print. It Is The Product.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          LeadTrace is the platform and carries the liability. That is why every guardrail below is
          non-bypassable, and why buyers pick us over stitched-together tooling.
        </p>
        <div className="grid md:grid-cols-2 gap-5 mt-12">
          {items.map((it) => (
            <div key={it.title} className="rounded-2xl border border-border bg-surface p-6">
              <div className="grid place-items-center h-11 w-11 rounded-xl bg-primary/10 text-primary">
                <it.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 font-display font-bold text-lg text-foreground">{it.title}</div>
              <p className="mt-2 text-sm text-muted-foreground">{it.body}</p>
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}