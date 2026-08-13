import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { UsCoverageMap, type MapState } from "@/components/marketing/us-coverage-map";
import { RouteErrorState } from "@/components/route-error";
import { Input } from "@/components/ui/input";
import { usd0 } from "@/components/marketing/surplus/guide-sections";
import { getSurplusCoverage } from "@/lib/surplus/public.functions";
import { canonicalUrl } from "@/lib/seo";
import { stateName } from "@/lib/state-guides.shared";
import { US_STATES } from "@/lib/us-geo";

const TITLE = "Surplus Funds Coverage By State | LeadTrace";
const DESCRIPTION =
  "See which states and counties have clerk-confirmed surplus funds and excess proceeds coverage in LeadTrace, and where coverage is expanding next.";

export const Route = createFileRoute("/surplus-funds/states")({
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
      { property: "og:url", content: canonicalUrl("/surplus-funds/states") },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/surplus-funds/states") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Surplus Funds",
              item: canonicalUrl("/surplus-funds"),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "States",
              item: canonicalUrl("/surplus-funds/states"),
            },
          ],
        }),
      },
    ],
  }),
  component: SurplusStatesIndex,
  errorComponent: RouteErrorState,
});

function SurplusStatesIndex() {
  const states = Route.useLoaderData()?.states ?? [];
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const live = states.filter((s) => s.recordCount > 0);
  const expanding = states.filter((s) => s.recordCount === 0);
  const totals = live.reduce(
    (acc, s) => ({
      records: acc.records + s.recordCount,
      amount: acc.amount + s.totalAmount,
      counties: acc.counties + s.countiesWithRecords,
    }),
    { records: 0, amount: 0, counties: 0 },
  );
  const lastUpdated = live
    .map((s) => s.dataAsOf)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  const mapStates: MapState[] = useMemo(
    () =>
      states.map((s) => ({
        code: s.state.toUpperCase(),
        status: s.recordCount > 0 ? "live" : "expanding",
        records: s.recordCount,
        counties: s.countiesWithRecords,
        recordTypes: 1,
        lastPull: s.dataAsOf ? new Date(s.dataAsOf).toLocaleDateString("en-US") : null,
      })),
    [states],
  );

  const q = query.trim().toLowerCase();
  const matches = (code: string) =>
    !q || stateName(code).toLowerCase().includes(q) || code.toLowerCase() === q;
  const covered = new Set(states.map((s) => s.state.toUpperCase()));
  const others = US_STATES.filter(
    (s) => s.code.length === 2 && !covered.has(s.code) && (!q || s.name.toLowerCase().includes(q)),
  );
  const visibleOthers = showAll || q ? others : others.slice(0, 16);

  return (
    <MarketingLayout>
      <div className="mx-auto w-full max-w-[92rem] px-6 py-14 lg:px-10">
        <nav className="text-sm text-muted-foreground">
          <Link to="/surplus-funds" className="hover:text-primary">
            Surplus Funds
          </Link>{" "}
          / States
        </nav>

        <section className="mt-6">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Surplus Funds Coverage
          </p>
          <h1 className="mt-3 font-display text-5xl font-bold leading-[1.05] text-foreground lg:text-6xl">
            Surplus Funds Across The U.S.
          </h1>
          <p className="mt-6 max-w-3xl text-xl text-muted-foreground">
            Coverage goes live only after a researcher verifies the state statute and the clerk
            offices holding the money.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-sm text-foreground">
            <span>
              {live.length} Live {live.length === 1 ? "State" : "States"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span>{totals.counties.toLocaleString()} Live Counties</span>
            <span className="text-muted-foreground">·</span>
            <span>{totals.records.toLocaleString()} Confirmed Records</span>
            {expanding.length ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{expanding.length} Expanding</span>
              </>
            ) : null}
            {lastUpdated ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span>Updated {new Date(lastUpdated).toLocaleDateString("en-US")}</span>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a state..."
                aria-label="Search a state"
                className="pl-9"
              />
            </div>
            <Link
              to="/app/surplus-funds"
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Search Surplus Funds <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {mapStates.length ? (
          <section className="mt-12">
            <UsCoverageMap states={mapStates} />
          </section>
        ) : null}

        <section className="mt-16">
          <h2 className="font-display text-3xl font-bold text-foreground">Live Coverage</h2>
          <p className="mt-1 text-base text-muted-foreground">
            {live.length === 1
              ? `Surplus funds are live in one state today — ${stateName(live[0].state)}.`
              : "States where LeadTrace tracks clerk-confirmed surplus balances today."}
          </p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {live.filter((s) => matches(s.state)).map((s) => (
              <div
                key={s.state}
                className="flex flex-col rounded-3xl border border-primary/30 bg-primary/5 p-8"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-3xl font-bold text-foreground">
                    {stateName(s.state)}
                  </h3>
                  <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    Live
                  </span>
                </div>
                <p className="mt-6 font-display text-5xl font-black tabular-nums leading-none text-foreground">
                  {usd0.format(s.totalAmount)}
                </p>
                <p className="mt-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Confirmed Unclaimed
                </p>
                <p className="mt-4 font-mono text-xs text-muted-foreground">
                  {s.recordCount.toLocaleString()} records ·{" "}
                  {s.countiesWithRecords.toLocaleString()} of {s.countyPages.toLocaleString()}{" "}
                  counties with balances
                  {s.dataAsOf
                    ? ` · updated ${new Date(s.dataAsOf).toLocaleDateString("en-US")}`
                    : ""}
                </p>
                <Link
                  to="/surplus-funds/$state"
                  params={{ state: s.state.toLowerCase() }}
                  className="mt-7 inline-flex w-fit items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  View Surplus Funds <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
            {live.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No state has confirmed balances published yet.
              </p>
            ) : null}
          </div>
        </section>

        {expanding.length ? (
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold text-foreground">Expanding Next</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Statute and clerk offices verified, first confirmed balances landing soon.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {expanding.filter((s) => matches(s.state)).map((s) => (
                <Link
                  key={s.state}
                  to="/surplus-funds/$state"
                  params={{ state: s.state.toLowerCase() }}
                  className="flex flex-col rounded-2xl border border-border bg-surface p-5 hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-foreground">
                      {stateName(s.state)}
                    </h3>
                    <span className="rounded-full border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                      Expanding
                    </span>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {s.countyPages.toLocaleString()} clerk{" "}
                    {s.countyPages === 1 ? "office" : "offices"} verified
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-14 rounded-3xl border border-border bg-surface-muted px-8 py-7">
          <h2 className="font-display text-xl font-bold text-foreground">More States</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Not covered yet. Surplus statutes differ state by state, so each one is researched before
            publishing.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {visibleOthers.map((s) => (
              <span key={s.code}>{s.name}</span>
            ))}
          </div>
          {!q && others.length > visibleOthers.length ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 text-sm font-semibold text-primary hover:underline"
            >
              Show all {others.length} states
            </button>
          ) : null}
        </section>

        <section className="mt-14 flex flex-wrap gap-2">
          {[
            { to: "/surplus-funds" as const, label: "Surplus Funds Overview" },
            { to: "/distress-feed/states" as const, label: "Distress Coverage By State" },
            { to: "/distress-feed" as const, label: "Distress Feed" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </section>
      </div>
    </MarketingLayout>
  );
}