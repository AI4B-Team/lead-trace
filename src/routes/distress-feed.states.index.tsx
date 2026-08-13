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
  RefreshCw,
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
  "surplus-funds": { icon: Wallet, sub: "Excess auction proceeds" },
  "demolition-orders": { icon: FileWarning, sub: "Demolition & vacate orders" },
};

const TITLE = "Distress Records By State — Live Coverage Map";
const DESCRIPTION =
  "Explore live distress-property coverage by state, county and record type — probate, tax liens, code violations, vacant properties and more, updated nightly.";

export const Route = createFileRoute("/distress-feed/states/")({
  loader: async () => getStatesIndex(),
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
  const data = Route.useLoaderData() as { states: FeedStateRow[]; guides: StateGuideRow[] };
  const { states, guides } = data;
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

  const totals = liveStates.reduce(
    (acc, s) => ({
      states: acc.states + 1,
      counties: acc.counties + s.counties,
      records: acc.records + s.records,
    }),
    { states: 0, counties: 0, records: 0 },
  );
  const recordTypeCount = new Set(guides.map((g) => g.record_type_slug)).size;

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

  const shownLive = liveStates.filter((s) => matchesQuery(s.name, s.code));

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
      <div className="mx-auto w-full max-w-[80rem] px-6 py-14">
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
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight text-foreground lg:text-5xl">
            Distress Records Across The U.S.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Explore live distress-property coverage by state, county and record type.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            See what's available, when it was last updated, and where LeadTrace is expanding next.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-sm text-foreground">
            <span>
              {totals.states} {totals.states === 1 ? "State" : "States"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span>{totals.counties.toLocaleString()} Counties</span>
            <span className="text-muted-foreground">·</span>
            <span>{totals.records.toLocaleString()} Records</span>
            <span className="text-muted-foreground">·</span>
            <span>{recordTypeCount} Record Types</span>
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

        {/* Live coverage */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold text-foreground">Live Coverage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            States where LeadTrace currently collects distress data.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shownLive.map((s) => {
              const stateGuides = guidesByState.get(s.code) ?? [];
              const isLive = s.records > 0;
              return (
                <div
                  key={s.code}
                  className="flex flex-col rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-xl font-bold text-foreground">{s.name}</h3>
                    {isLive ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        Live
                      </span>
                    ) : (
                      <span className="rounded-full border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                        Expanding
                      </span>
                    )}
                  </div>

                  {isLive ? (
                    <>
                      <p className="mt-3 font-display text-3xl font-black tabular-nums text-foreground">
                        {s.records.toLocaleString()}
                      </p>
                      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Distress Records
                      </p>
                      <p className="mt-3 font-mono text-xs text-muted-foreground">
                        {s.counties.toLocaleString()} counties covered · updated{" "}
                        {formatDate(s.row.last_pull_at)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 font-display text-3xl font-black tabular-nums text-foreground">
                        {s.counties.toLocaleString()}
                      </p>
                      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Counties Wired
                      </p>
                      <p className="mt-3 font-mono text-xs text-muted-foreground">
                        Coverage initializing — first nightly pull in progress.
                      </p>
                    </>
                  )}

                  {stateGuides.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {stateGuides.map((g) => (
                        <Link
                          key={g.record_type_slug}
                          to="/distress-feed/states/$state/$recordType"
                          params={{ state: s.code.toLowerCase(), recordType: g.record_type_slug }}
                          className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-primary hover:border-primary"
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
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                  >
                    View {s.name} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
            {shownLive.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No live coverage matches "{query}" yet.
              </p>
            ) : null}
          </div>
        </section>

        {/* Browse by record type */}
        {typeLinks.length ? (
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold text-foreground">Browse By Record Type</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {typeLinks.map(([slug, state]) => (
                <Link
                  key={slug}
                  to="/distress-feed/states/$state/$recordType"
                  params={{ state, recordType: slug }}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
                >
                  {recordTypeLabel(recordTypeIdForSlug(slug) ?? slug)}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* More states */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold text-foreground">More States</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We're expanding county by county. Tell us where you buy and we'll prioritize it.
          </p>
          <div className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
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
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              View All States <ChevronDown className="h-4 w-4" />
            </button>
          ) : null}
        </section>

        {/* CTAs */}
        <section className="mt-16 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-8">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Don't See Your Market?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell us where you need distress data. We prioritize new counties based on customer
              demand.
            </p>
            <Link
              to="/start"
              className="mt-5 inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
            >
              Request A County <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Ready To Find Opportunities?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Search the distress records already available in LeadTrace.
            </p>
            <Link
              to="/distress-feed"
              className="mt-5 inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Search Distress Records <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
