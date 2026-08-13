import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, ScrollText, Wallet } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { RouteErrorState } from "@/components/route-error";
import { getStateHub } from "@/lib/state-guides.functions";
import { getSurplusStatePage } from "@/lib/surplus/public.functions";
import { canonicalUrl } from "@/lib/seo";
import { formatDate, recordTypeLabel, type FeedCountyRow } from "@/lib/distress-feed.shared";
import {
  LEGAL_DISCLAIMER,
  recordTypeIdForSlug,
  stateName,
  truncate,
  type StateGuideRow,
  type StateTypeStats,
} from "@/lib/state-guides.shared";

export const Route = createFileRoute("/distress-feed/states/$state/")({
  loader: async ({ params }) => {
    if (params.state.length !== 2) throw notFound();
    const data = await getStateHub({ data: { state: params.state.toUpperCase() } });
    // Surplus coverage lives in its own published guide layer. A miss here must
    // not blank the hub, and an unpublished state gets no surplus card at all.
    const surplus = await getSurplusStatePage({ data: { state: params.state.toUpperCase() } }).catch(
      () => null,
    );
    return {
      ...data,
      stateName: stateName(data.state),
      surplus:
        surplus?.rules && surplus.aggregate
          ? {
              records: surplus.aggregate.record_count,
              counties: surplus.counties.length,
            }
          : null,
    };
  },
  head: ({ loaderData }) => {
    const d = loaderData as
      | {
          state: string;
          stateName: string;
          counties: Array<{ total_records: number }>;
          guides: StateGuideRow[];
        }
      | undefined;
    if (!d) return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    const total = d.counties.reduce((sum, c) => sum + Number(c.total_records ?? 0), 0);
    const title = `${d.stateName} Distress Records — Coverage, Law & How To Pull Them`;
    const description = truncate(
      `${d.counties.length} covered ${d.stateName} counties and ${total.toLocaleString()} tracked filings. Record types, who holds them, and step-by-step pull instructions.`,
    );
    const url = canonicalUrl(`/distress-feed/states/${d.state.toLowerCase()}`);
    const published = d.guides.length > 0;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        ...(published ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: url }],
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
              { "@type": "ListItem", position: 3, name: d.stateName, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: StateHub,
  errorComponent: RouteErrorState,
  notFoundComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground">State Not Found</h1>
        <Link
          to="/distress-feed/states"
          className="mt-6 inline-block text-sm font-semibold text-primary"
        >
          Browse all states
        </Link>
      </div>
    </MarketingLayout>
  ),
});

function StateHub() {
  const loaded = Route.useLoaderData() as unknown as {
    state: string;
    stateName: string;
    counties: FeedCountyRow[];
    guides: StateGuideRow[];
    stats: Array<{ slug: string; stats: StateTypeStats | null }>;
    surplus: { records: number; counties: number } | null;
  };
  const { state, stateName: name, counties, guides, stats, surplus } = loaded;
  const statsBySlug = new Map<string, StateTypeStats | null>(stats.map((s) => [s.slug, s.stats]));
  const totalRecords = counties.reduce((sum, c) => sum + Number(c.total_records ?? 0), 0);
  const lastPull = counties
    .map((c) => c.last_pull_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();
  const statute = (guides as StateGuideRow[]).find(
    (g) => g.law_public_records_statute,
  )?.law_public_records_statute;

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-4xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">
            Distress Feed
          </Link>{" "}
          /{" "}
          <Link to="/distress-feed/states" className="hover:text-primary">
            States
          </Link>{" "}
          / {name}
        </nav>

        <h1 className="mt-4 font-display text-4xl font-bold text-foreground">
          {name} Distress Records
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          <strong className="text-foreground">
            LeadTrace tracks {counties.length.toLocaleString()} {name} counties
          </strong>{" "}
          across every record type below.
          {totalRecords > 0 ? ` ${totalRecords.toLocaleString()} filings tracked today.` : ""}
        </p>
        {lastPull ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            as of {formatDate(lastPull)}
          </p>
        ) : null}

        {surplus ? (
          <Link
            to="/distress-feed/states/$state/surplus-funds"
            params={{ state: state.toLowerCase() }}
            className="mt-10 block rounded-2xl border border-primary/30 bg-primary/5 p-6 transition hover:border-primary"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-display text-xl font-bold text-foreground">
                <Wallet className="h-5 w-5 text-primary" aria-hidden /> Surplus Funds
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                View Surplus Funds <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Auction overages and unclaimed excess proceeds.
            </p>
            {surplus.records > 0 ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {surplus.records.toLocaleString()} records ·{" "}
                {surplus.counties.toLocaleString()} counties
              </p>
            ) : null}
          </Link>
        ) : null}

        {guides.length ? (
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {(guides as StateGuideRow[]).map((g) => {
              const s = statsBySlug.get(g.record_type_slug);
              const label = recordTypeLabel(
                recordTypeIdForSlug(g.record_type_slug) ?? g.record_type_slug,
              );
              return (
                <Link
                  key={g.record_type_slug}
                  to="/distress-feed/states/$state/$recordType"
                  params={{ state: state.toLowerCase(), recordType: g.record_type_slug }}
                  className="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold text-foreground">{label}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {s && s.records > 0 ? (
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {s.records.toLocaleString()} records · {s.counties_covered.toLocaleString()}{" "}
                      counties
                    </p>
                  ) : null}
                  {g.intro ? (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{g.intro}</p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-10 rounded-2xl border border-border bg-surface-muted p-6 text-sm text-muted-foreground">
            State guides for {name} are still being written. County coverage below is live.
          </p>
        )}

        {statute ? (
          <section className="mt-10 rounded-2xl border border-border bg-surface-muted p-6">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground">
              <ScrollText className="h-4 w-4 text-primary" /> Public Records Law
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{statute}</p>
            <p className="mt-3 text-xs text-muted-foreground">{LEGAL_DISCLAIMER}</p>
          </section>
        ) : null}

        <Link
          to="/distress-feed/counties/$state"
          params={{ state: state.toLowerCase() }}
          className="mt-10 inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          All {name} counties <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </MarketingLayout>
  );
}
