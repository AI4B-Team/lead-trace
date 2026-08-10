import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Database, ShieldCheck, Sparkles, Clock, FileSearch, MapPin, Check,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { getFeedLanding } from "@/lib/distress-feed.functions";
import {
  RECORD_TYPES, countyPath, statePath, formatDate, formatAmount, recordTypeLabel, FEED_PATH,
  type FeedPreviewRow, type FeedStateRow,
} from "@/lib/distress-feed.shared";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/distress-feed/")({
  loader: () => getFeedLanding(),
  head: ({ loaderData }) => {
    const totals = (loaderData as { totals?: { total_records: number; counties: number } } | undefined)?.totals;
    const volume = totals?.total_records ? `${totals.total_records.toLocaleString()} filings` : "County filings";
    return {
      meta: [
        { title: "Distress Feed — Probate & Foreclosure Leads" },
        {
          name: "description",
          content: `${volume} across ${totals?.counties ?? 0} counties. Probate, pre-foreclosure, tax deed, liens and evictions — scrubbed, skip traced, ready to text.`,
        },
        { property: "og:title", content: "Distress Feed — Motivated Seller Records, Pulled Nightly" },
        {
          property: "og:description",
          content: "Every new distress filing in your county, arriving contactable instead of as a CSV you still have to clean.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonicalUrl(FEED_PATH) }],
    };
  },
  component: DistressFeedLanding,
  errorComponent: RouteErrorState,
  notFoundComponent: () => <RouteNotFoundState />,
});

const STEPS = [
  { icon: Database, title: "We Pull Nightly", body: "Every covered county, every record type, every morning. One pull serves everybody who wants that county." },
  { icon: MapPin, title: "You Filter Your Market", body: "State, county, record type, filing date. The feed defaults to what is new since you last looked." },
  { icon: Check, title: "Select What You Want", body: "Nothing is charged for what gets scanned. Credits move only on the records you pull into your leads." },
  { icon: ShieldCheck, title: "It Arrives Contactable", body: "Enriched, deduplicated, line-type checked, DNC and litigator scrubbed, skip traced. Ready to text." },
];

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4">
      <div className="font-mono text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function DistressFeedLanding() {
  const { totals, states, top, sample, sampleCounty } = Route.useLoaderData();

  return (
    <MarketingLayout>
      {/* Above the fold: paid traffic, one CTA, no exits. */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
          <Clock className="h-3.5 w-3.5" /> Pulled Every Morning
        </span>
        <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl">
          Yesterday's Probate, Foreclosure And Tax Deed Filings — Already Skip Traced
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          We pull county distress records nightly and hand you the owners with phone numbers attached,
          DNC and litigator scrubbed, ready to text. You are not buying a CSV to go clean.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat value={totals.total_records.toLocaleString()} label="Records In The Feed" />
          <Stat value={`${totals.counties} / ${totals.states}`} label="Counties / States Covered" />
          <Stat value={`+${totals.added_this_week.toLocaleString()}`} label="Added This Week" />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link to="/start">
              Start Free — See Your County <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            Last pull {formatDate(totals.last_pull_at)}
          </span>
        </div>

        {/* Real recent filings, surnames masked. */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-sm font-semibold text-foreground">
              Recent Filings{sampleCounty ? ` — ${sampleCounty.county} County, ${sampleCounty.state}` : ""}
            </span>
            <span className="text-xs text-muted-foreground">Surnames masked until you sign in</span>
          </div>
          {sample.length ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Record</th>
                  <th className="px-5 py-2 font-medium">Filed</th>
                  <th className="px-5 py-2 font-medium">Owner</th>
                  <th className="px-5 py-2 font-medium">City</th>
                  <th className="px-5 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {sample.map((r: FeedPreviewRow, i: number) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-5 py-2 text-foreground">{recordTypeLabel(r.record_type)}</td>
                    <td className="px-5 py-2 text-muted-foreground">{formatDate(r.filed_date)}</td>
                    <td className="px-5 py-2 text-foreground">{r.owner_masked}</td>
                    <td className="px-5 py-2 text-muted-foreground">{r.property_city ?? "—"}</td>
                    <td className="px-5 py-2 text-muted-foreground">{formatAmount(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              The first counties are being brought online now. Pick your county and we will tell you the
              morning it starts flowing.
            </p>
          )}
        </div>
      </section>

      {/* Why this is different */}
      <section className="border-t border-border bg-surface-muted/40 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-bold text-foreground">Why This Is Different</h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Everyone else hands you a CSV. Ours arrives enriched, line-type checked, DNC and litigator
            scrubbed, and skip traced. Nobody else sells you a list you still have to go clean.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Sparkles, title: "Contactable On Arrival", body: "Owner, mailing address and mobile number attached before you ever see the record." },
              { icon: ShieldCheck, title: "Scrubbed Before You Text", body: "Line type checked, DNC and litigator screened, suppression applied at send time too." },
              { icon: Database, title: "One Parcel, One Lead", body: "A house that shows up in both the feed and Street Scan merges into a single lead carrying both signals." },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-border bg-surface p-6">
                <c.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-display font-bold text-foreground">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's in the feed */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-bold text-foreground">What's In The Feed</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {RECORD_TYPES.map((t) => (
              <div key={t.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display font-bold text-foreground">{t.label}</h3>
                  {t.requestOnly ? (
                    <span className="shrink-0 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[0.625rem] font-semibold text-primary">
                      Records Request
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
            Evictions and demolition orders are not published on any portal. We obtain them through
            standing public records requests to the agency, cited to the governing state statute.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface-muted/40 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-bold text-foreground">How It Works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-border bg-surface p-5">
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <s.icon className="mt-3 h-5 w-5 text-primary" />
                <h3 className="mt-3 font-display font-bold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-bold text-foreground">One Credit Pool Covers Everything</h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            The feed is free to browse and filter — the nightly pull is our cost, not yours. Your plan's
            credits are spent when a record becomes a lead, and one credit is one record fully processed.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { name: "Starter", price: "$97", credits: "2,500 lead credits", extra: "5 sending numbers · skip trace $0.06" },
              { name: "Growth", price: "$197", credits: "8,000 lead credits", extra: "15 numbers · skip trace included", popular: true },
              { name: "Scale", price: "$497", credits: "20,000 lead credits", extra: "50 numbers · skip trace included" },
            ].map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 ${p.popular ? "border-primary bg-primary/5" : "border-border bg-surface"}`}
              >
                {p.popular ? (
                  <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-primary">Most Popular</span>
                ) : null}
                <h3 className="mt-1 font-display text-xl font-bold text-foreground">{p.name}</h3>
                <div className="mt-2 font-mono text-3xl font-bold text-foreground">{p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                <p className="mt-3 text-sm text-foreground">{p.credits}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.extra}</p>
              </div>
            ))}
          </div>
          <Link to="/pricing" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
            See full pricing <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground">See What Filed In Your County Last Night</h2>
          <p className="mt-4 text-muted-foreground">
            Free to start. Pick your county, look at the feed, and only spend credits on what you pull.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/start">
              Start Free — See Your County <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* SEO link section: below the final CTA on purpose. */}
      <section className="border-t border-border bg-surface-muted/40 py-14">
        <div className="mx-auto max-w-6xl px-6 grid gap-10 md:grid-cols-3">
          <div>
            <h3 className="font-display font-bold text-foreground">Browse Coverage By State</h3>
            <ul className="mt-3 space-y-1.5 text-sm">
              {states.map((s: FeedStateRow) => (
                <li key={s.state}>
                  <Link to={statePath(s.state)} className="text-muted-foreground hover:text-primary">
                    {s.state} — {s.counties} counties
                  </Link>
                </li>
              ))}
              <li>
                <Link to={`${FEED_PATH}/counties`} className="font-semibold text-primary">
                  All covered counties
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Popular Counties</h3>
            <ul className="mt-3 space-y-1.5 text-sm">
              {top.length ? (
                top.map((c: { state: string; county: string; total_records: number }) => (
                  <li key={`${c.state}-${c.county}`}>
                    <Link to={countyPath(c.state, c.county)} className="text-muted-foreground hover:text-primary">
                      {c.county} County, {c.state}
                    </Link>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">Ranking by volume as counties come online.</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">How To Pull Records Yourself</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              Step-by-step walkthroughs for each county portal — the exact URL, the exact clicks, and what
              each status in the legend means.
            </p>
            <Link
              to={`${FEED_PATH}/guides`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              <FileSearch className="h-4 w-4" /> Browse the guides
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
