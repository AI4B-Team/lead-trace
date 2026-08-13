import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Clock, Download, MessageSquare, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { PipelineFunnel } from "@/components/app/pipeline-funnel";
import { CONTENT_UPDATED, REFERENCE_FUNNEL, crossLinks, startSearchLink, type LeadPage } from "@/lib/lead-pages";

/**
 * The single skeleton every programmatic landing page renders through
 * (spec §9.1, blocks [1]–[10]). Blocks [5], [7] and [9] never change.
 */
export function LeadLandingPage({ page }: { page: LeadPage }) {
  const links = crossLinks(page);
  const ctaSearch = startSearchLink(page);
  const ctaLabel = page.nicheLabel ? `Start Free — ${page.nicheLabel} Search` : "Start Free";

  // §9.1: FAQPage structured data so the FAQ block can win rich results.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <MarketingLayout>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* [1] H1 + tag row */}
      <section className="bg-background pt-16 pb-10">
        <div className="mx-auto max-w-5xl px-6">
          <h1 className="font-display text-4xl md:text-6xl font-black leading-[1.05] text-foreground">
            {page.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {page.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground/80"
              >
                {t}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Updated {CONTENT_UPDATED}
            </span>
          </div>

          {/* [2] Value prop */}
          <p className="mt-8 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            {page.valueProp}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/auth" search={ctaSearch}>
                {ctaLabel} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/how-it-works">See The Pipeline</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* [3] Data preview */}
      <section className="border-y border-border bg-surface py-14">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            Here's Exactly What A Clean List Looks Like
          </h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-background">
            <table className="w-full min-w-[53.75rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Mobile Phone</th>
                  <th className="px-4 py-3">Line Type</th>
                  <th className="px-4 py-3">DNC</th>
                  <th className="px-4 py-3">Litigator</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Reviews</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Website</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.business} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{r.business}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{r.phone}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.lineType}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Check className="h-3.5 w-3.5 text-primary" /> {r.dnc}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Check className="h-3.5 w-3.5 text-primary" /> {r.litigator}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{r.rating}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.reviews}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.city}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.website}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
            Numbers that fail the checks don't disappear — they land in two separate files (DNC List and
            Litigator List) so you have a timestamped record of every number you correctly{" "}
            <em>didn't</em> text. Sample rows are illustrative: fabricated names and 555 numbers.
          </p>
        </div>
      </section>

      {/* [4] Mini pipeline funnel */}
      <section className="bg-background py-14">
        <div className="mx-auto max-w-3xl px-6">
          <PipelineFunnel stages={REFERENCE_FUNNEL} />
          <p className="mt-5 text-center text-sm text-muted-foreground">{page.funnelCaption}</p>
        </div>
      </section>

      {/* [5] Mid-page CTA — identical on every page */}
      <section className="border-y border-border bg-surface py-14">
        <div className="mx-auto max-w-none px-6 text-center">
          <h2 className="font-display font-black text-foreground whitespace-nowrap text-[clamp(1.05rem,3.4vw,2.5rem)]">
            Type A Niche And A County. Get A Clean List In Minutes.
          </h2>
          <Button asChild size="lg" className="mt-7 rounded-full">
            <Link to="/auth" search={ctaSearch}>
              {ctaLabel} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            No download. No credit card for your first search.
          </p>
          {page.nicheLabel && (
            <p className="mt-3 text-sm text-muted-foreground">
              We open your search with <strong className="text-foreground">{page.nicheLabel}</strong> already
              filled in — pick your county and run it.
            </p>
          )}
        </div>
      </section>

      {/* [6] Who this is for */}
      <section className="bg-background py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">Who This Is For</h2>
          {page.nicheLabel && (
            <div className="mt-8 rounded-2xl border border-border bg-surface p-7 md:flex md:items-center md:justify-between md:gap-8">
              <div>
                <div className="font-display text-xl font-black text-foreground">
                  Don't Want To Run It Yourself? We'll Run It For You.
                </div>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Tell us the niche and the geography. We deliver all three files — Clean List, DNC List,
                  Litigator List — and can launch the texting campaign for you. Same pipeline, same audit
                  trail, none of the clicking.
                </p>
              </div>
              <Button asChild size="lg" variant="outline" className="mt-5 shrink-0 rounded-full md:mt-0">
                <Link to="/pricing">See Done-For-You Pricing</Link>
              </Button>
            </div>
          )}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {page.personas.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border bg-surface p-6">
                <div className="font-display text-lg font-black text-foreground">{p.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* [7] Compliance block — identical on every page */}
      <section className="border-y border-border bg-surface py-16">
        <div className="mx-auto max-w-4xl px-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground/80">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> The Moat
          </div>
          <h2 className="mt-5 font-display text-3xl md:text-4xl font-black text-foreground">
            Compliant By Default — Not By Discipline.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Every list is scrubbed against the National DNC Registry and a continuously updated
            known-litigator database before you ever see it. Every scrub is stamped with the provider,
            timestamp, and reference ID on each record — if you ever get a demand letter, you export your
            scrub log. Campaigns automatically append opt-out language, process STOP replies permanently,
            and only send during the recipient's local daytime hours. Lists older than 30 days are
            re-scrubbed before any campaign launches, because numbers join the registry every day.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {[
              "DNC + litigator scrub on every list",
              "Timestamped, exportable audit trail",
              "Automatic, permanent STOP handling",
              "Quiet hours by recipient timezone",
            ].map((c) => (
              <div key={c} className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 text-primary" /> {c}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* [8] Honest notes & FAQs */}
      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            Honest Notes & FAQs
          </h2>
          <dl className="mt-8 divide-y divide-border">
            {page.faqs.map((f) => (
              <div key={f.q} className="py-6">
                <dt className="font-display text-lg font-black text-foreground">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* [9] How it works — never more than 3 steps */}
      <section className="border-y border-border bg-surface py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">How It Works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { icon: Search, title: "Enter niche + location", body: "Your niche plus a county, metro, or ZIP list." },
              { icon: Sparkles, title: "We scrape, clean & scrub", body: "Google Maps pull, dedupe, franchise filter, mobile verification, DNC + litigator scrub. Runs in the cloud — close the tab if you want." },
              { icon: Download, title: "Download or start texting", body: "Three files ready, or push the Clean List straight into a drip campaign." },
            ].map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-border bg-background p-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <s.icon className="h-4 w-4 text-primary" /> Step {i + 1}
                </div>
                <div className="mt-3 font-display text-lg font-black text-foreground">{s.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* [10] Cross-links */}
      <section className="bg-background py-16">
        <div className="mx-auto max-w-6xl px-6 grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-black text-foreground">Related Lists</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {links.related.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/leads/$slug"
                    params={{ slug: p.slug }}
                    className="text-muted-foreground hover:text-primary"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-xl font-black text-foreground">How The Pipeline Works</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {links.stages.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/leads/$slug"
                    params={{ slug: p.slug }}
                    className="text-muted-foreground hover:text-primary"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-6xl px-6">
          <h2 className="font-display text-xl font-black text-foreground">You May Also Like</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {links.alsoLike.map((p) => (
              <Link
                key={p.slug}
                to="/leads/$slug"
                params={{ slug: p.slug }}
                className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
              >
                <div className="font-display text-lg font-black text-foreground">{p.title}</div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{p.valueProp}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  View List <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4 text-primary" />
            <Link to="/leads" className="font-semibold text-foreground hover:text-primary">
              Browse every lead list &amp; pipeline page
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
