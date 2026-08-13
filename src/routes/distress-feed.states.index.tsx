import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ClipboardList,
  DoorClosed,
  FileWarning,
  Gavel,
  Landmark,
  Receipt,
  Scale,
  Search,
  Wallet,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { UsCoverageMap, type MapState } from "@/components/marketing/us-coverage-map";
import { RouteErrorState } from "@/components/route-error";
import { Input } from "@/components/ui/input";
import { getStatesIndex } from "@/lib/state-guides.functions";
import { canonicalUrl } from "@/lib/seo";
import { formatDate, recordTypeLabel, type FeedStateRow } from "@/lib/distress-feed.shared";
import { recordTypeIdForSlug, type StateGuideRow } from "@/lib/state-guides.shared";
import { US_STATES } from "@/lib/us-geo";

const TYPE_META: Record<string, { icon: typeof Gavel; sub: string }> = {
  probate: { icon: Gavel, sub: "Court & estate filings" },
  "pre-foreclosure": { icon: Scale, sub: "Lender filings & lis pendens" },
  "tax-deed": { icon: Landmark, sub: "Tax deed sales & auctions" },
  "tax-liens": { icon: Receipt, sub: "Delinquent tax records" },
  "tax-delinquent": { icon: Receipt, sub: "Owners behind on taxes" },
  "vacant-properties": { icon: DoorClosed, sub: "Vacancy & distress signals" },
  liens: { icon: ClipboardList, sub: "Recorded liens & judgments" },
  "code-violations": { icon: FileWarning, sub: "Municipal violations" },
  evictions: { icon: Building2, sub: "Tired-landlord signals" },
  "surplus-funds": { icon: Wallet, sub: "Auction overages & excess proceeds" },
  "demolition-orders": { icon: FileWarning, sub: "Demolition & vacate orders" },
};

const TITLE = "Distress Records By State — Live Coverage Map";
const DESCRIPTION =
  "Explore live distress-property coverage by state, county and record type — probate, tax liens, code violations, vacant properties and more, updated nightly.";

export const Route = createFileRoute("/distress-feed/states/")({
  // A transient RPC/network failure on client navigation must not blank the page:
  // SSR data is nice-to-have here, so degrade to an empty coverage set instead.
  loader: async () => {
    try {
      return await getStatesIndex();
    } catch {
      return { states: [], guides: [] };
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/distress-feed/states") },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/distress-feed/states") }],
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
              name: "Distress Feed",
              item: canonicalUrl("/distress-feed"),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "States",
              item: canonicalUrl("/distress-feed/states"),
            },
          ],
        }),
      },
    ],
  }),
  component: StatesIndex,
  errorComponent: RouteErrorState,
});

function StatesIndex() {
  const data = Route.useLoaderData() as
    | { states: FeedStateRow[]; guides: StateGuideRow[] }
    | undefined;
  const states = data?.states ?? [];
  const guides = data?.guides ?? [];
  const covered = new Map<string, FeedStateRow>(states.map((s) => [s.state.toUpperCase(), s]));
  const guidesByState = new Map<string, StateGuideRow[]>();
  for (const g of guides as StateGuideRow[]) {
    const key = g.state.toUpperCase();
    guidesByState.set(key, [...(guidesByState.get(key) ?? []), g]);
  }

  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // A state is "live" once it actually holds records; infrastructure exists but
  // nothing has landed yet reads as "expanding", never as a bare 0.
  const liveStates = useMemo(
    () =>
      [...covered.values()]
        .map((s) => ({
            row: s,
            code: s.state.toUpperCase(),
            name: US_STATES.find((x) => x.code === s.state.toUpperCase())?.name ?? s.state,
            records: Number(s.total_records) || 0,
            counties: Number(s.counties) || 0,
            types: (guidesByState.get(s.state.toUpperCase()) ?? []).length,
        }))
        .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name)),
    [states, guides],
  );

  const activeStates = liveStates.filter((s) => s.records > 0);
  const expandingStates = liveStates.filter((s) => s.records === 0);
  const totals = activeStates.reduce(
    (acc, s) => ({
      counties: acc.counties + s.counties,
      records: acc.records + s.records,
    }),
    { counties: 0, records: 0 },
  );
  const recordTypeCount = new Set(guides.map((g) => g.record_type_slug)).size;
  const featured = activeStates[0];

  const mapStates: MapState[] = liveStates.map((s) => ({
    code: s.code,
    status: s.records > 0 ? "live" : "expanding",
    records: s.records,
    counties: s.counties,
    recordTypes: s.types,
    lastPull: s.records > 0 ? formatDate(s.row.last_pull_at) : null,
  }));

  const q = query.trim().toLowerCase();
  const matchesQuery = (name: string, code: string) =>
    !q || name.toLowerCase().includes(q) || code.toLowerCase() === q;

  const shownActive = activeStates.filter((s) => matchesQuery(s.name, s.code));
  const shownExpanding = expandingStates.filter((s) => matchesQuery(s.name, s.code));

  const otherStates = US_STATES.filter(
    (s) => s.code.length === 2 && !covered.has(s.code) && matchesQuery(s.name, s.code),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const visibleOthers = showAll || q ? otherStates : otherStates.slice(0, 16);

  // Record types we actually publish a state guide for, each pointing at the
  // first state where it is live.
  const typeLinks = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of guides) {
      if (!map.has(g.record_type_slug)) map.set(g.record_type_slug, g.state.toLowerCase());
    }
    return [...map.entries()];
  }, [guides]);

  return (
    <MarketingLayout>
      <div className="mx-auto w-full max-w-[92rem] px-6 py-14 lg:px-10">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">
            Distress Feed
          </Link>{" "}
          / States
        </nav>

        {/* Hero */}
        <section className="mt-6">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Distress Data Coverage
          </p>
          <h1 className="mt-3 whitespace-nowrap font-display text-5xl font-bold leading-[1.05] text-foreground lg:text-7xl">
            Distress Records Across The U.S.
          </h1>
          <p className="mt-6 max-w-3xl text-xl text-muted-foreground lg:text-2xl">
            Explore live distress-property coverage by state, county and record type.
          </p>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            See what's available, when it was last updated, and where LeadTrace is expanding next.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-sm text-foreground">
            <span>
              {activeStates.length} Live {activeStates.length === 1 ? "State" : "States"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span>{totals.counties.toLocaleString()} Live Counties</span>
            <span className="text-muted-foreground">·</span>
            <span>{totals.records.toLocaleString()} Records</span>
            {expandingStates.length ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{expandingStates.length} States Expanding</span>
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
              to="/distress-feed/counties"
              className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
            >
              Browse Counties <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Coverage map */}
        <section className="mt-12">
          <UsCoverageMap states={mapStates} />
        </section>

        {/* Live now */}
        <section className="mt-16">
          <h2 className="font-display text-3xl font-bold text-foreground">Live Now</h2>
          <p className="mt-1 text-base text-muted-foreground">
            States where LeadTrace collects distress records today.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {shownActive.map((s) => {
              const stateGuides = guidesByState.get(s.code) ?? [];
              return (
                <div
                  key={s.code}
                  className={
                    "flex flex-col rounded-3xl border border-primary/30 bg-primary/5 p-8 transition-colors hover:border-primary" +
                    (s.code === featured?.code && shownActive.length === 1 ? " lg:col-span-1" : "")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-3xl font-bold text-foreground">{s.name}</h3>
                    <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                      Live
                    </span>
                  </div>

                  <p className="mt-6 font-display text-6xl font-black tabular-nums leading-none text-foreground">
                    {s.records.toLocaleString()}
                  </p>
                  <p className="mt-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Distress Records
                  </p>
                  <p className="mt-4 font-mono text-xs text-muted-foreground">
                    {s.counties.toLocaleString()} counties covered · updated{" "}
                    {formatDate(s.row.last_pull_at)}
                  </p>

                  {stateGuides.length ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {stateGuides.map((g) => (
                        <Link
                          key={g.record_type_slug}
                          to="/distress-feed/states/$state/$recordType"
                          params={{ state: s.code.toLowerCase(), recordType: g.record_type_slug }}
                          className="rounded-full border border-primary/30 bg-background px-3 py-1 text-xs font-semibold text-primary hover:border-primary"
                        >
                          {recordTypeLabel(
                            recordTypeIdForSlug(g.record_type_slug) ?? g.record_type_slug,
                          )}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  <Link
                    to="/distress-feed/states/$state"
                    params={{ state: s.code.toLowerCase() }}
                    className="mt-7 inline-flex w-fit items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Explore {s.name} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
            {shownActive.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No live coverage matches "{query}" yet.
              </p>
            ) : null}

            {shownExpanding.length ? (
              <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                  <h3 className="font-display text-xl font-bold text-foreground">Expanding Next</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Counties connected, first records landing soon.
                  </p>
                </div>
                {shownExpanding.map((s) => (
                  <Link
                    key={s.code}
                    to="/distress-feed/states/$state"
                    params={{ state: s.code.toLowerCase() }}
                    className="flex flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-display text-lg font-bold text-foreground">{s.name}</h4>
                      <span className="rounded-full border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                        Expanding
                      </span>
                    </div>
                    <p className="mt-3 font-display text-2xl font-black tabular-nums text-foreground">
                      {s.counties.toLocaleString()}
                    </p>
                    <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {s.counties === 1 ? "County Connected" : "Counties Connected"}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Data collection initializing. First records coming soon.
                    </p>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* Coverage at a glance */}
        <section className="mt-16 rounded-3xl border border-border bg-surface-muted px-8 py-8">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Coverage At A Glance
          </h2>
          <dl className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: totals.records.toLocaleString(), label: "Live Records" },
              { value: totals.counties.toLocaleString(), label: "Counties Covered" },
              { value: String(recordTypeCount), label: "Record Types" },
              { value: "Nightly", label: "Data Refresh" },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="font-display text-4xl font-black tabular-nums text-foreground">
                  {stat.value}
                </dd>
                <dt className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </section>

        {/* Browse by record type */}
        {typeLinks.length ? (
          <section className="mt-16">
            <h2 className="font-display text-3xl font-bold text-foreground">
              Browse By Record Type
            </h2>
            <p className="mt-1 text-base text-muted-foreground">
              Every distress signal LeadTrace publishes, with state-by-state pull instructions.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {typeLinks.map(([slug, state]) => {
                const meta = TYPE_META[slug];
                const Icon = meta?.icon ?? ClipboardList;
                return (
                  <Link
                    key={slug}
                    to="/distress-feed/states/$state/$recordType"
                    params={{ state, recordType: slug }}
                    className="group flex flex-col rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="mt-4 font-display text-lg font-bold text-foreground">
                      {recordTypeLabel(recordTypeIdForSlug(slug) ?? slug)}
                    </span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      {meta?.sub ?? "Public distress records"}
                    </span>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      View coverage
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Expanding nationwide */}
        <section className="mt-16 rounded-3xl border border-border bg-surface-muted px-8 py-8">
          <h2 className="font-display text-2xl font-bold text-foreground">Expanding Nationwide</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            LeadTrace is adding new counties based on data availability and customer demand.
          </p>
          <div className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
            {visibleOthers.map((s) => (
              <span key={s.code} className="text-sm text-muted-foreground">
                {s.name}
              </span>
            ))}
          </div>
          {!q && otherStates.length > visibleOthers.length ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              View All 50 States <ChevronDown className="h-4 w-4" />
            </button>
          ) : null}
        </section>

        {/* CTAs */}
        <section className="mt-16 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-primary/30 bg-primary/5 p-10">
            <h2 className="font-display text-3xl font-bold text-foreground">
              Ready To Find Opportunities?
            </h2>
            <p className="mt-3 max-w-xl text-base text-muted-foreground">
              Search live distress records and start building your next list.
            </p>
            <Link
              to="/distress-feed"
              className="mt-6 inline-flex items-center gap-1 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Search Distress Records <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-10">
            <h2 className="font-display text-2xl font-bold text-foreground">Need Another Market?</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Tell us which county you'd like LeadTrace to add next.
            </p>
            <Link
              to="/start"
              className="mt-6 inline-flex items-center gap-1 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
            >
              Request A County <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
