import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { getGuideIndex } from "@/lib/distress-feed.functions";
import { countySlug, recordTypeById, recordTypeLabel, type FeedGuideRow } from "@/lib/distress-feed.shared";
import { US_STATES } from "@/lib/us-geo";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/distress-feed/guides/$state/")({
  loader: async ({ params }) => {
    if (params.state.length !== 2) throw notFound();
    const { guides } = await getGuideIndex({ data: { state: params.state.toUpperCase() } });
    if (!guides.length) throw notFound();
    const state = params.state.toUpperCase();
    return { guides, state, stateName: US_STATES.find((s) => s.code === state)?.name ?? state };
  },
  head: ({ loaderData }) => {
    const d = loaderData as { state: string; stateName: string } | undefined;
    if (!d) return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    const title = `${d.stateName} County Records Guides — Probate, Tax Deed, Foreclosure`;
    const description = `How to pull distress records from every covered ${d.stateName} county portal, step by step.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonicalUrl(`/distress-feed/guides/${d.state.toLowerCase()}`) }],
    };
  },
  component: StateGuides,
  errorComponent: RouteErrorState,
  notFoundComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground">No Guides Yet For That State</h1>
        <Link to="/distress-feed/guides" className="mt-6 inline-block text-sm font-semibold text-primary">
          Browse all guides
        </Link>
      </div>
    </MarketingLayout>
  ),
});

function StateGuides() {
  const { guides, state, stateName } = Route.useLoaderData();
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-4xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">Distress Feed</Link> /{" "}
          <Link to="/distress-feed/guides" className="hover:text-primary">Guides</Link> / {stateName}
        </nav>
        <h1 className="mt-4 font-display text-4xl font-bold text-foreground">{stateName} County Records Guides</h1>
        <ul className="mt-8 space-y-2 text-sm">
          {guides.map((g: FeedGuideRow) => (
            <li key={`${g.county}-${g.record_type}`}>
              <Link
                to="/distress-feed/guides/$state/$county/$recordType"
                params={{
                  state: state.toLowerCase(),
                  county: countySlug(g.county),
                  recordType: recordTypeById(g.record_type)?.slug ?? g.record_type,
                }}
                className="text-primary hover:underline"
              >
                {g.title ?? `How to pull ${recordTypeLabel(g.record_type)} records in ${g.county} County`}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </MarketingLayout>
  );
}
