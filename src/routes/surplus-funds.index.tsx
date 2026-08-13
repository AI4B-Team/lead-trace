import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Gavel,
  Landmark,
  Layers,
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
  return <SurplusFundsHubBody />;
}

/** Coverage status pill: red when a county has confirmed records, outlined while it is being added. */
function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={
        live
          ? "shrink-0 rounded-full bg-primary px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground"
          : "shrink-0 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary"
      }
    >
      {live ? "Live" : "Expanding"}
    </span>
  );
}

function SurplusFundsHubBody() {
  const states = Route.useLoaderData()?.states ?? [];
  const live = states.filter((s) => s.recordCount > 0);
  const totals = live.reduce(
    (acc, s) => ({
      records: acc.records + s.recordCount,
      amount: acc.amount + s.totalAmount,
      counties: acc.counties + s.countiesWithRecords,
    }),
    { records: 0, amount: 0, counties: 0 },
  );
  // Coverage metrics come straight from the published aggregates — no invented
  // counts, and a genuine zero renders the verification state instead.
  const markets = states.filter((s) => s.counties.length > 0);
  const liveCounties = states.reduce(
    (n, s) => n + s.counties.filter((c) => c.recordCount > 0).length,
    0,
  );
  const expandingCounties = states.reduce(
    (n, s) => n + s.counties.filter((c) => c.recordCount === 0).length,
    0,
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
          <p className="mt-6 whitespace-nowrap text-base text-muted-foreground sm:text-lg lg:text-xl">
            Track excess proceeds created after foreclosure and tax-sale auctions, organized by state, county and claim opportunity.
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
            <p className="mt-7 max-w-none whitespace-nowrap font-mono text-sm text-muted-foreground">
              Clerk confirmation is in progress. Coverage goes live state by state — see where we are today.
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
          <p className="mt-2 max-w-none whitespace-nowrap text-base text-muted-foreground">
            Every surplus record carries its confidence on the card. We never present arithmetic as a clerk balance.
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

        {/* Coverage module */}
        <section className="mt-16 overflow-hidden rounded-3xl border border-border bg-surface">
          <div className="grid lg:grid-cols-[1fr_1.1fr]">
            {/* Left — headline + honest status metrics */}
            <div className="border-b border-border p-8 lg:border-b-0 lg:border-r">
              <h2 className="font-display text-3xl font-bold text-foreground">
                Surplus Funds Coverage
              </h2>
              <p className="mt-2 max-w-md text-base text-muted-foreground">
                See where verified surplus records are currently available — and where coverage is
                expanding next.
              </p>
              <p className="mt-4 max-w-md text-sm text-muted-foreground">
                We add coverage county by county as official surplus and unclaimed-funds sources are
                verified.
              </p>
              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    label: "Live",
                    value: liveCounties.toLocaleString(),
                    note: "Counties with verified sources",
                  },
                  {
                    label: "Expanding",
                    value: expandingCounties.toLocaleString(),
                    note: "Counties being added",
                  },
                  {
                    label: "Records",
                    value: totals.records.toLocaleString(),
                    note: "Verified surplus records",
                  },
                ].map((m) => (
                  <div key={m.label} className="rounded-2xl border border-border bg-background p-4">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                      {m.label}
                    </p>
                    <p className="mt-2 font-display text-3xl font-black tabular-nums leading-none text-foreground">
                      {m.value}
                    </p>
                    <p className="mt-2 text-xs leading-snug text-muted-foreground">{m.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — real markets, or an honest verification state */}
            <div className="flex flex-col p-8">
              {markets.length === 0 ? (
                <div className="flex flex-1 flex-col items-start justify-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <p className="mt-4 font-display text-2xl font-bold text-foreground">
                    Coverage is being verified.
                  </p>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    We only publish a market after its official source has been confirmed.
                  </p>
                  <Link
                    to="/distress-feed/counties"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Request Your County <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-1 flex-col">
                  <div className="space-y-6">
                    {markets.map((m) => (
                      <div key={m.state}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
                            {stateName(m.state)}
                          </p>
                          <Link
                            to="/surplus-funds/$state"
                            params={{ state: m.state.toLowerCase() }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            {m.recordCount > 0 ? usd0.format(m.totalAmount) : "—"}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border">
                          {m.counties.map((c) => (
                            <li
                              key={c.slug}
                              className="flex items-center justify-between gap-3 bg-background px-4 py-2.5"
                            >
                              <span className="truncate text-sm font-medium text-foreground">
                                {c.name} County
                              </span>
                              <StatusPill live={c.recordCount > 0} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex justify-end">
                    <Link
                      to="/surplus-funds/states"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    >
                      View Full Coverage <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Two ways to find surplus */}
        <section className="mt-16">
          <h2 className="font-display text-3xl font-bold text-foreground">
            Two Ways To Find Surplus Opportunities
          </h2>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            Search surplus funds on their own — or find them alongside other signs of property
            distress.
          </p>

          <div className="mt-6 grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
            {/* Focused */}
            <div className="flex flex-col rounded-3xl border border-primary/40 bg-primary/5 p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <CircleDollarSign className="h-5 w-5" />
              </span>
              <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Focused Search
              </p>
              <h3 className="mt-1.5 font-display text-2xl font-bold text-foreground">
                Surplus Funds
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Search only properties and owners tied to potential surplus proceeds.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  "Surplus-focused records",
                  "Filter by county and sale date",
                  "Confirmed vs. estimated amounts",
                  "Contact enrichment when available",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/app/surplus-funds"
                className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Search className="h-4 w-4" /> Search Surplus Funds
              </Link>
            </div>

            {/* Connector */}
            <div className="hidden flex-col items-center justify-center gap-2 lg:flex">
              <span className="h-16 w-px bg-border" />
              <span className="whitespace-nowrap rounded-full border border-border bg-background px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Also Included In
              </span>
              <span className="h-16 w-px bg-border" />
            </div>

            {/* Broader */}
            <div className="flex flex-col rounded-3xl border border-border bg-surface p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Layers className="h-5 w-5" />
              </span>
              <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Broader Search
              </p>
              <h3 className="mt-1.5 font-display text-2xl font-bold text-foreground">
                Distress Feed
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Find surplus funds alongside the other distress signals that can reveal
                motivated-property opportunities.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  "Probate",
                  "Tax Defaults",
                  "Pre-Foreclosures",
                  "Code Violations",
                  "Vacant Properties",
                  "Surplus Funds",
                ].map((p) => (
                  <span
                    key={p}
                    className={
                      p === "Surplus Funds"
                        ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                        : "rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {p}
                  </span>
                ))}
              </div>
              <Link
                to="/distress-feed"
                className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-sm font-semibold text-primary hover:underline"
              >
                Explore Distress Feed <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
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