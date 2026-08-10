import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { getFeedCounties } from "@/lib/distress-feed.functions";
import { countySlug, formatDate, type FeedCountyRow } from "@/lib/distress-feed.shared";
import { US_STATES } from "@/lib/us-geo";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/distress-feed/counties/$state/")({
  loader: async ({ params }) => {
    if (params.state.length !== 2) throw notFound();
    const { counties } = await getFeedCounties({ data: { state: params.state.toUpperCase() } });
    if (!counties.length) throw notFound();
    const state = params.state.toUpperCase();
    return { counties, state, stateName: US_STATES.find((s) => s.code === state)?.name ?? state };
  },
  head: ({ loaderData }) => {
    const d = loaderData as { state: string; stateName: string; counties: Array<{ total_records: number }> } | undefined;
    if (!d) return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    const total = d.counties.reduce((sum, c) => sum + Number(c.total_records ?? 0), 0);
    const title = `${d.stateName} Probate, Foreclosure & Tax Deed Records By County`;
    const description = `${d.counties.length} covered ${d.stateName} counties, ${total.toLocaleString()} distress filings. Pulled nightly, enriched, DNC scrubbed and skip traced.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonicalUrl(`/distress-feed/counties/${d.state.toLowerCase()}`) }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Distress Feed", item: "/distress-feed" },
              { "@type": "ListItem", position: 2, name: "Coverage", item: "/distress-feed/counties" },
              { "@type": "ListItem", position: 3, name: d.stateName },
            ],
          }),
        },
      ],
    };
  },
  component: StateCounties,
  errorComponent: RouteErrorState,
  notFoundComponent: StateMissing,
});

function StateMissing() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground">We Don't Cover That State Yet</h1>
        <p className="mt-4 text-muted-foreground">
          Tell us the county and record type you need and it goes into the build queue.
        </p>
        <Link to="/distress-feed/counties" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          See covered states <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </MarketingLayout>
  );
}

function StateCounties() {
  const { counties, state, stateName } = Route.useLoaderData();
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-5xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">Distress Feed</Link> /{" "}
          <Link to="/distress-feed/counties" className="hover:text-primary">Coverage</Link> / {stateName}
        </nav>
        <h1 className="mt-4 font-display text-4xl font-bold text-foreground">
          {stateName} Distress Records By County
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Probate, pre-foreclosure, tax deed, liens, code violations and evictions for every covered
          county in {stateName}.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {counties.map((c: FeedCountyRow) => (
            <Link
              key={c.county}
              to="/distress-feed/counties/$state/$county"
              params={{ state: state.toLowerCase(), county: countySlug(c.county) }}
              className="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-bold text-foreground">{c.county} County</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                +{Number(c.new_this_week).toLocaleString()} new this week · {Number(c.total_records).toLocaleString()} total
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Last pull {formatDate(c.last_pull_at)}</p>
            </Link>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}
