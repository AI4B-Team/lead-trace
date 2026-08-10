import { canonicalUrl } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import {
  Search, Landmark, Upload, UserSearch, ShieldCheck, MessageSquare, Activity, Lock,
} from "lucide-react";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — LeadTrace" },
      { name: "description", content: "Niche scraper, public records, skip trace, DNC scrub, smart campaigns, list quality score, and compliance built in." },
      { property: "og:title", content: "LeadTrace Features" },
      { property: "og:description", content: "Everything the pipeline needs. Nothing it doesn't." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/features") }],
  }),
  component: Features,
});

function Features() {
  const features = [
    { icon: Search, title: "Niche Scraper", body: "Type A Trade And A State. Get Every Small Business, Franchises Removed." },
    { icon: Landmark, title: "Public Records", body: "Probates, Code Violations, Pre-Foreclosures, Tax Defaults, Vacancy Notices." },
    { icon: Upload, title: "Bring Your Own List", body: "Already Have Data? Drop A CSV And Skip Straight To Cleaning." },
    { icon: UserSearch, title: "Auto Skip Trace", body: "Missing Phone Numbers Filled In Automatically." },
    { icon: ShieldCheck, title: "Built-In Scrubbing", body: "DNC And Litigators Removed. Three Files, Every Time." },
    { icon: MessageSquare, title: "Smart Campaigns", body: "Geo-Matched Numbers, Message Rotation, Reply-Stop Drips." },
    { icon: Activity, title: "List Quality Score", body: "See How Hot A List Is Before You Spend A Credit." },
    { icon: Lock, title: "Compliance First", body: "10DLC Guided Setup, STOP Handling, Audit Logs." },
  ];
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">Features</div>
        <h1 className="mt-3 font-display text-5xl font-black text-foreground max-w-3xl leading-tight">
          Everything The Pipeline Needs. Nothing It Doesn't.
        </h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-surface p-6">
              <div className="grid place-items-center h-11 w-11 rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 font-display font-bold text-lg text-foreground">{f.title}</div>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}