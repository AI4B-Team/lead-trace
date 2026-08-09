import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Search, Upload, ShieldCheck, MessageSquare, Phone, CreditCard, Rocket, Landmark, Settings2,
  Star, Play, ArrowRight, Clock, FileSpreadsheet, Users, Webhook, Ban, BadgeCheck, Receipt,
  Gauge, Building2, Reply, Layers,
} from "lucide-react";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Center — LeadTrace" },
      { name: "description", content: "Search LeadTrace help: build and upload lists, clean and verify data, launch SMS campaigns, manage credits, and stay compliant." },
      { property: "og:title", content: "LeadTrace Help Center" },
      { property: "og:description", content: "Guides, tutorials, and answers — from your first list to your first campaign." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/help" }],
  }),
  component: Help,
});

const QUICK_START = [
  { step: "1", title: "Generate Your First List", body: "Pick a niche and a location, or upload a list you already own.", to: "/leads" },
  { step: "2", title: "Verify Contacts", body: "Dedupe, line-type check, and scrub against DNC and litigator data.", to: "/how-it-works" },
  { step: "3", title: "Launch SMS", body: "Send from local numbers with quiet hours and STOP handling built in.", to: "/features" },
];

const CATEGORIES = [
  {
    icon: Rocket, name: "Getting Started",
    articles: [
      { icon: Search, label: "Generate Lists" },
      { icon: Upload, label: "Upload Existing Lists" },
      { icon: MessageSquare, label: "Your First Campaign" },
      { icon: Landmark, label: "Public Records Searches" },
    ],
  },
  {
    icon: MessageSquare, name: "Messaging",
    articles: [
      { icon: MessageSquare, label: "SMS Campaigns" },
      { icon: Phone, label: "Phone Numbers" },
      { icon: Reply, label: "Reply Detection" },
      { icon: Ban, label: "STOP Handling" },
    ],
  },
  {
    icon: ShieldCheck, name: "Compliance",
    articles: [
      { icon: ShieldCheck, label: "DNC Scrubbing" },
      { icon: Ban, label: "Litigator Scrubbing" },
      { icon: BadgeCheck, label: "10DLC Registration" },
      { icon: Building2, label: "Carrier Brand Approval" },
    ],
  },
  {
    icon: CreditCard, name: "Billing",
    articles: [
      { icon: Gauge, label: "Credits Explained" },
      { icon: CreditCard, label: "Plans & Pricing" },
      { icon: Receipt, label: "Invoices & Receipts" },
      { icon: Search, label: "Skip Trace Limits" },
    ],
  },
  {
    icon: Settings2, name: "Platform",
    articles: [
      { icon: Layers, label: "Workspaces" },
      { icon: Users, label: "Users & Roles" },
      { icon: Webhook, label: "API & Webhooks" },
      { icon: FileSpreadsheet, label: "CSV Field Mapping" },
    ],
  },
];

const TUTORIALS = [
  { title: "Create Your First List", length: "3 Minutes" },
  { title: "Launch Your First Campaign", length: "4 Minutes" },
  { title: "Import A CSV", length: "2 Minutes" },
  { title: "Understanding Credits", length: "90 Seconds" },
];

const POPULAR = [
  "Getting Started", "Uploading A CSV", "Phone Numbers", "Skip Trace", "Credits Explained", "DNC Compliance",
];

const FAQS = [
  { q: "Do I Need To Install Anything?", a: "No. Everything runs in the browser, and runs keep going server-side after you close the tab." },
  { q: "Can I Text Landlines?", a: "Landlines and VoIP stay on your list for calling, but they're excluded from the textable pool." },
  { q: "How Fresh Is The DNC Scrub?", a: "Lists older than 30 days are re-scrubbed automatically before a campaign can launch." },
  { q: "What Happens If A Provider Is Down?", a: "Your run pauses safely, shows the exact stage that stalled, and resumes on its own — nothing is discarded." },
  { q: "Is Skip Tracing Included?", a: "Skip tracing is included on Growth and up within daily and monthly fair-use limits, then metered per hit." },
  { q: "Can I Bring My Own Data?", a: "Yes. Upload a CSV, map your columns, and run the same clean-and-scrub pipeline without paying for sourcing." },
];

function Help() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const categories = useMemo(() => {
    if (!q) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      articles: c.articles.filter((a) => a.label.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)),
    })).filter((c) => c.articles.length > 0);
  }, [q]);

  const faqs = useMemo(
    () => (q ? FAQS.filter((f) => (f.q + f.a).toLowerCase().includes(q)) : FAQS),
    [q],
  );

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="border-b border-border bg-surface-muted">
        <div className="mx-auto max-w-7xl px-6 py-20 text-center">
          <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">Help Center</div>
          <h1 className="mt-3 font-display text-5xl lg:text-6xl font-black text-foreground leading-tight">
            How Can We Help?
          </h1>
          <p className="mt-5 text-lg text-muted-foreground mx-auto max-w-3xl lg:whitespace-nowrap">
            Learn how to build lists, launch campaigns, and get the most from LeadTrace.
          </p>

          <div className="relative mx-auto mt-8 max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Help Articles..."
              aria-label="Search help articles"
              className="h-14 rounded-full bg-background pl-12 pr-5 text-base"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.name}
                onClick={() => setQuery(c.name)}
                className="rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {c.name}
              </button>
            ))}
            <Link
              to="/tutorials"
              className="rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              Tutorials
            </Link>
          </div>
        </div>
      </section>

      {/* Quick start */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_2.2fr] lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-black text-foreground">New To LeadTrace?</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Three steps from raw data to compliant outreach.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" /> Estimated Time: 8 Minutes
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {QUICK_START.map((s) => (
              <Link
                key={s.step}
                to={s.to}
                className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground font-display text-sm font-bold">
                  {s.step}
                </span>
                <div className="mt-4 font-display font-bold text-foreground">{s.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories + popular */}
      <section className="border-t border-border bg-surface-muted">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <h2 className="font-display text-3xl font-black text-foreground">Browse By Topic</h2>
              {categories.length === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">
                  No articles match “{query}”. Try a broader term or{" "}
                  <Link to="/tutorials" className="font-semibold text-primary">browse the tutorials</Link>.
                </p>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {categories.map((c) => (
                    <div key={c.name} className="rounded-2xl border border-border bg-surface p-6">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                          <c.icon className="h-5 w-5" strokeWidth={1.5} />
                        </span>
                        <h3 className="font-display font-bold text-lg text-foreground">{c.name}</h3>
                      </div>
                      <ul className="mt-4 space-y-1">
                        {c.articles.map((a) => (
                          <li key={a.label}>
                            <Link
                              to="/tutorials"
                              className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                            >
                              <a.icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
                              <span className="min-w-0 truncate">{a.label}</span>
                              <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="font-display text-lg font-bold text-foreground">Popular</h2>
                <ul className="mt-4 space-y-1">
                  {POPULAR.map((p) => (
                    <li key={p}>
                      <Link
                        to="/tutorials"
                        className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                      >
                        <Star className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
                        <span className="min-w-0 truncate">{p}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Tutorials */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-3xl font-black text-foreground">Featured Tutorials</h2>
            <p className="mt-2 text-sm text-muted-foreground">Short walkthroughs of the moves you'll make most.</p>
          </div>
          <Button asChild variant="outline" className="rounded-full shrink-0">
            <Link to="/tutorials">See All Tutorials</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {TUTORIALS.map((t) => (
            <Link
              key={t.title}
              to="/tutorials"
              className="group rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-primary"
            >
              <div className="relative grid aspect-video place-items-center rounded-xl bg-ink text-ink-foreground">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-105">
                  <Play className="h-6 w-6" />
                </span>
                <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-[0.6875rem] font-semibold text-foreground">
                  {t.length}
                </span>
              </div>
              <div className="px-2 pb-1 pt-4 font-display font-bold text-foreground">{t.title}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-surface-muted">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-3xl font-black text-foreground">Common Questions</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Still stuck? Send a note from the Help menu inside the app and we'll read it.
              </p>
              <Button asChild className="mt-5 rounded-full">
                <Link to="/auth" search={{ mode: "signup" }}>Open The App</Link>
              </Button>
            </div>
            <Accordion type="single" collapsible className="rounded-2xl border border-border bg-surface px-6">
              {faqs.map((f) => (
                <AccordionItem key={f.q} value={f.q}>
                  <AccordionTrigger className="text-left font-display font-bold text-base text-foreground">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
              {faqs.length === 0 && (
                <p className="py-6 text-sm text-muted-foreground">No questions match “{query}”.</p>
              )}
            </Accordion>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
