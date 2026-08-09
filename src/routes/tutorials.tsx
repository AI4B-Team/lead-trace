import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/tutorials")({
  head: () => ({
    meta: [
      { title: "Tutorials — Run Your First Clean List — LeadTrace" },
      { name: "description", content: "Short walkthroughs: build a list, import a CSV, read the pipeline funnel, register your brand, and launch a compliant SMS drip." },
      { property: "og:title", content: "LeadTrace Tutorials" },
      { property: "og:description", content: "Short walkthroughs from first list to first campaign." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/tutorials" }],
  }),
  component: Tutorials,
});

const LESSONS = [
  { minutes: "3 Min", title: "Build Your First List", body: "Pick a niche and counties, set a result cap, and read the credit estimate before you run.", to: "/app/assistant" },
  { minutes: "2 Min", title: "Import Your Own CSV", body: "Map your columns once and let the pipeline dedupe, line-type check, and scrub the rest.", to: "/app/assistant?source=upload" },
  { minutes: "2 Min", title: "Read The Pipeline Funnel", body: "Found → Deduped → Textable → Scrubbed → Clean, and what each drop protects you from.", to: "/app/reports" },
  { minutes: "4 Min", title: "Register Your Brand", body: "Carrier registration at no cost, plus the training material your bot is allowed to use.", to: "/app/brands" },
  { minutes: "5 Min", title: "Launch A Compliant Drip", body: "Number pools, quiet hours by recipient timezone, and automatic STOP handling.", to: "/app/campaigns/new" },
  { minutes: "2 Min", title: "Work The Inbox", body: "Replies land in one thread view — hand off from the bot the moment someone's interested.", to: "/app/inbox" },
];

function Tutorials() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="max-w-3xl">
          <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">Tutorials</div>
          <h1 className="mt-3 font-display text-5xl font-black text-foreground leading-tight">Run Your First Clean List</h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Six short lessons that take you from raw data to ready-to-contact leads.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-14">
          {LESSONS.map((l, idx) => (
            <Link
              key={l.title}
              to={l.to}
              className="group flex flex-col rounded-2xl border border-border bg-surface p-6 hover:border-primary transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-black text-2xl text-primary">{String(idx + 1).padStart(2, "0")}</span>
                <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {l.minutes}
                </span>
              </div>
              <h2 className="mt-4 font-display font-bold text-lg text-foreground">{l.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{l.body}</p>
              <div className="mt-auto pt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Start Lesson <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}