import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { getGuideIndex } from "@/lib/distress-feed.functions";
import { countySlug, recordTypeById, recordTypeLabel, type FeedGuideRow } from "@/lib/distress-feed.shared";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/distress-feed/guides/")({
  loader: () => getGuideIndex({ data: {} }),
  head: () => ({
    meta: [
      { title: "How To Pull County Distress Records — Guides By County" },
      {
        name: "description",
        content:
          "Step-by-step walkthroughs for pulling probate, tax deed, foreclosure and code violation records from each county portal — the real URL, the real clicks.",
      },
      { property: "og:title", content: "County Records Guides" },
      { property: "og:description", content: "Pull probate, tax deed and foreclosure records yourself, county by county." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/distress-feed/guides") }],
  }),
  component: GuidesIndex,
  errorComponent: RouteErrorState,
  notFoundComponent: () => <RouteNotFoundState />,
});

function GuidesIndex() {
  const { guides } = Route.useLoaderData();
  const states: string[] = [...new Set(guides.map((g: FeedGuideRow) => g.state))] as string[];
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-4xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">Distress Feed</Link> / Guides
        </nav>
        <h1 className="mt-4 font-display text-4xl font-bold text-foreground">County Records Guides</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Genuine walkthroughs for pulling each record type from each county's own portal. Do it by hand,
          or let the Distress Feed do it every morning.
        </p>

        {states.map((st: string) => (
          <section key={st} className="mt-10">
            <h2 className="font-display text-2xl font-bold text-foreground">
              <Link to="/distress-feed/guides/$state" params={{ state: st.toLowerCase() }} className="hover:text-primary">
                {st}
              </Link>
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {guides
                .filter((g: FeedGuideRow) => g.state === st)
                .map((g: FeedGuideRow) => (
                  <li key={`${g.county}-${g.record_type}`}>
                    <Link
                      to="/distress-feed/guides/$state/$county/$recordType"
                      params={{
                        state: g.state.toLowerCase(),
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
          </section>
        ))}
        {guides.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">The first guides are being published now.</p>
        ) : null}
      </div>
    </MarketingLayout>
  );
}
