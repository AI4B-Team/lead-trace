import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { RouteErrorState } from "@/components/route-error";
import { getStatesIndex } from "@/lib/state-guides.functions";
import { canonicalUrl } from "@/lib/seo";
import { formatDate, recordTypeLabel, type FeedStateRow } from "@/lib/distress-feed.shared";
import { recordTypeIdForSlug, type StateGuideRow } from "@/lib/state-guides.shared";
import { US_STATES } from "@/lib/us-geo";

const TITLE = "Distress Records By State — Coverage & State Law Guides";
const DESCRIPTION =
  "State-by-state coverage of probate, foreclosure, tax lien, tax deed, code violation and surplus funds records — who holds them, how to pull them, and where LeadTrace tracks them nightly.";

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
  const ordered = [...US_STATES]
    .filter((s) => s.code.length === 2)
    .sort((a, b) => {
      const av = covered.get(a.code) ? 0 : 1;
      const bv = covered.get(b.code) ? 0 : 1;
      return av - bv || a.name.localeCompare(b.name);
    });

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-5xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">
            Distress Feed
          </Link>{" "}
          / States
        </nav>
        <h1 className="mt-4 font-display text-4xl font-bold text-foreground">
          Distress Records By State
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Who holds the records, what the state calls them, and which counties we track today. Live
          counts on every page — we publish a state guide only once the coverage behind it is real.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {ordered.map((s) => {
            const summary = covered.get(s.code);
            const stateGuides = guidesByState.get(s.code) ?? [];
            return (
              <div key={s.code} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  {summary ? (
                    <Link
                      to="/distress-feed/states/$state"
                      params={{ state: s.code.toLowerCase() }}
                      className="font-display text-lg font-bold text-foreground hover:text-primary"
                    >
                      {s.name}
                    </Link>
                  ) : (
                    <span className="font-display text-lg font-bold text-muted-foreground">
                      {s.name}
                    </span>
                  )}
                  {summary ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {Number(summary.total_records).toLocaleString()} records
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">Not yet covered</span>
                  )}
                </div>
                {summary ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {Number(summary.counties).toLocaleString()} counties · last pull{" "}
                    {formatDate(summary.last_pull_at)}
                  </p>
                ) : null}
                {stateGuides.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
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
              </div>
            );
          })}
        </div>

        <Link
          to="/distress-feed/counties"
          className="mt-10 inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          Browse coverage by county <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </MarketingLayout>
  );
}
