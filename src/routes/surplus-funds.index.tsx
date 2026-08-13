import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Gavel,
  Landmark,
  MapPin,
  Search,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { RouteErrorState } from "@/components/route-error";
import { SurplusComplianceNotice } from "@/components/distress/surplus-compliance-notice";
import { getSurplusCoverage } from "@/lib/surplus/public.functions";
import { usd0 } from "@/components/marketing/surplus/guide-sections";
import { canonicalUrl } from "@/lib/seo";
import { stateName } from "@/lib/state-guides.shared";

const TITLE = "Surplus Funds & Foreclosure Auction Overages | LeadTrace";
const DESCRIPTION =
  "Search clerk-confirmed surplus funds created after foreclosure and tax-sale auctions, organized by state, county and claim deadline.";

export const Route = createFileRoute("/surplus-funds/")({
  // Coverage is nice-to-have context on a marketing page: a transient RPC
  // failure must not blank the hero.
  loader: async () => {
    try {
      return await getSurplusCoverage();
    } catch {
      return { states: [] };
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/surplus-funds") },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/surplus-funds") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
            {
              "@type": "ListItem",
              position: 2,
              name: "Surplus Funds",
              item: canonicalUrl("/surplus-funds"),
            },
          ],
        }),
      },
    ],
  }),
  component: SurplusFundsHub,
  errorComponent: RouteErrorState,
});

function SurplusFundsHub() {
  const data = Route.useLoaderData() as { states: Array<Record<string, never>> } | undefined;
  const states = (Route.useLoaderData()?.states ?? []) as NonNullable<
    Awaited<ReturnType<typeof getSurplusCoverage>>
  >["states"];
  void data;

  const live = states.filter((s) => s.recordCount > 0);
  const totals = live.reduce(
    (acc, s) => ({
      records: acc.records + s.recordCount,
      amount: acc.amount + s.totalAmount,
      counties: acc.counties + s.countiesWithRecords,
    }),
    { records: 0, amount: 0, counties: 0 },
  );

  return (
    <MarketingLayout>
      <div className="mx-auto w-full max-w-[92rem] px-6 py-14 lg:px-10">
        {/* Hero */}
        <section>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Surplus Funds Data
          </p>
          <h1 className="mt-3 font-display text-5xl font-bold leading-[1.05] text-foreground lg:text-7xl">
            Find Unclaimed Surplus Funds Before Everyone Else.
          </h1>
          <p className="mt-6 max-w-3xl text-xl text-muted-foreground lg:text-2xl">
            Track excess proceeds created after foreclosure and tax-sale auctions, organized by
            state, county and claim opportunity.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/app/surplus-funds"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Search className="h-4 w-4" /> Search Surplus Funds
            </Link>
            <Link
              to="/surplus-funds/states"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
            >
              Browse Coverage <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {live.length ? (
            <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-sm text-foreground">
              <span>
                {live.length} Live {live.length === 1 ? "State" : "States"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>{totals.counties.toLocaleString()} Live Counties</span>
              <span className="text-muted-foreground">·</span>
              <span>{totals.records.toLocaleString()} Confirmed Records</span>
              <span className="text-muted-foreground">·</span>
              <span>{usd0.format(totals.amount)} Confirmed Unclaimed</span>
            </div>
          ) : (
            <p className="mt-7 max-w-2xl font-mono text-sm text-muted-foreground">
              Clerk confirmation is in progress. Coverage goes live state by state — see where we
              are today.
            </p>
          )}
        </section>

        {/* What this is */}
        <section className="mt-16 grid gap-5 lg:grid-cols-3">
          {[
            {
              icon: Gavel,
              title: "Foreclosure Overages",
              body: "When a foreclosure sale brings more than the judgment, the difference belongs to the former owner — not the lender.",
            },
            {
              icon: Landmark,
              title: "Tax-Sale Excess Proceeds",
              body: "Tax deed and tax lien sales routinely clear far above the taxes owed. The clerk holds the balance until somebody claims it.",
            },
            {
              icon: Timer,
              title: "Claim Deadlines",
              body: "Every state sets a window before unclaimed money is transferred out. Records are sorted by how little time is left.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-3xl border border-border bg-surface p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-display text-xl font-bold text-foreground">{c.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </section>

        {/* Confirmed vs estimated */}
        <section className="mt-16 rounded-3xl border border-border bg-surface-muted px-8 py-8">
          <h2 className="font-display text-3xl font-bold text-foreground">
            Confirmed Is Never Mixed With Estimated
          </h2>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            Every surplus record carries its confidence on the card. We never present arithmetic as
            a clerk balance.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-primary/30 bg-background p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                <BadgeCheck className="h-3 w-3" /> Confirmed
              </span>
              <p className="mt-3 text-sm text-muted-foreground">
                The balance was read from the clerk's own unclaimed funds list, with the source URL
                and the date it was verified attached to the record.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <CircleDollarSign className="h-3 w-3" /> Estimated
              </span>
              <p className="mt-3 text-sm text-muted-foreground">
                Derived from a published auction result — winning bid against the amount owed.
                Useful for research, never published as an amount somebody is owed.
              </p>
            </div>
          </div>
        </section>

        {/* Live coverage */}
        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">Where It's Live</h2>
              <p className="mt-1 text-base text-muted-foreground">
                States with a verified statute, verified clerk offices and confirmed balances.
              </p>
            </div>
            <Link
              to="/surplus-funds/states"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Full coverage map <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {states.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No state guide is published yet. Coverage is added county by county after a
                researcher verifies the clerk's list.
              </p>
            ) : null}
            {states.map((s) => (
              <Link
                key={s.state}
                to="/surplus-funds/$state"
                params={{ state: s.state.toLowerCase() }}
                className="flex flex-col rounded-3xl border border-border bg-surface p-7 transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-2xl font-bold text-foreground">
                    {stateName(s.state)}
                  </h3>
                  <span
                    className={
                      s.recordCount > 0
                        ? "rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground"
                        : "rounded-full border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary"
                    }
                  >
                    {s.recordCount > 0 ? "Live" : "Expanding"}
                  </span>
                </div>
                <p className="mt-5 font-display text-4xl font-black tabular-nums leading-none text-foreground">
                  {s.recordCount > 0 ? usd0.format(s.totalAmount) : "—"}
                </p>
                <p className="mt-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Confirmed Unclaimed
                </p>
                <p className="mt-4 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {s.countyPages.toLocaleString()} county{s.countyPages === 1 ? "" : " pages"} ·{" "}
                  {s.recordCount.toLocaleString()} records
                </p>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  View Surplus Funds <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Cross-links */}
        <section className="mt-16">
          <h2 className="font-display text-3xl font-bold text-foreground">
            Surplus Funds Sit Inside The Distress Feed Too
          </h2>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            Surplus is one record type in the wider feed. Ask for every distress signal in a county
            and surplus comes with it; select Surplus Funds and you get overages only.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { to: "/distress-feed" as const, label: "Distress Feed" },
              { to: "/distress-feed/states" as const, label: "Distress Coverage By State" },
              { to: "/distress-feed/counties" as const, label: "Counties" },
              { to: "/templates" as const, label: "All Lead Templates" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </section>

        {/* CTAs */}
        <section className="mt-16 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-primary/30 bg-primary/5 p-8">
            <h2 className="font-display text-3xl font-bold text-foreground">
              Build A Surplus Funds List
            </h2>
            <p className="mt-2 max-w-xl text-base text-muted-foreground">
              Filter by county, sale date, amount and confidence, then push the records into a
              LeadTrace list to skip trace, scrub and export them.
            </p>
            <Link
              to="/app/surplus-funds"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Search className="h-4 w-4" /> Search Surplus Funds
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-bold text-foreground">
              Need A County Added?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell us the clerk and we'll verify the list before publishing anything.
            </p>
            <Link
              to="/distress-feed/counties"
              className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Request A County <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <div className="mt-12">
          <SurplusComplianceNotice />
        </div>

        <p className="mt-8 border-t border-border pt-8 text-xs leading-relaxed text-muted-foreground">
          LeadTrace publishes public-record research data. We do not determine ownership,
          entitlement to funds, claim eligibility, final surplus amounts, or whether a recovery will
          succeed. Verify every balance and deadline with the county clerk.
        </p>
      </div>
    </MarketingLayout>
  );
}