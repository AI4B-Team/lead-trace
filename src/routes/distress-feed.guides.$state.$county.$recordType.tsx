import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { getGuideDetail } from "@/lib/distress-feed.functions";
import { countyFromSlug, countySlug, recordTypeBySlug, recordTypeLabel } from "@/lib/distress-feed.shared";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/distress-feed/guides/$state/$county/$recordType")({
  loader: async ({ params }) => {
    const type = recordTypeBySlug(params.recordType);
    if (!type || params.state.length !== 2) throw notFound();
    const { guide } = await getGuideDetail({
      data: {
        state: params.state.toUpperCase(),
        county: countyFromSlug(params.county),
        recordType: type.id,
      },
    });
    if (!guide) throw notFound();
    return { guide };
  },
  head: ({ loaderData }) => {
    const guide = (loaderData as { guide?: { county: string; state: string; record_type: string; title: string | null; intro: string | null; portal_url: string; steps: Array<{ heading?: string; body: string }> } } | undefined)?.guide;
    if (!guide) return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    const label = recordTypeLabel(guide.record_type);
    const title = guide.title ?? `How To Pull ${label} Records In ${guide.county} County`;
    const description =
      guide.intro?.slice(0, 155) ??
      `Step-by-step walkthrough for pulling ${label} records in ${guide.county} County, ${guide.state}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        {
          rel: "canonical",
          href: canonicalUrl(`/distress-feed/guides/${guide.state.toLowerCase()}/${countySlug(guide.county)}/${
            recordTypeBySlug(guide.record_type)?.slug ?? guide.record_type
          }`,
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: title,
            description,
            tool: [{ "@type": "HowToTool", name: guide.portal_url) }],
            step: guide.steps.map((s: { heading?: string; body: string }, i: number) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: s.heading ?? `Step ${i + 1}`,
              text: s.body,
            })),
          }),
        },
      ],
    };
  },
  component: GuideDetail,
  errorComponent: RouteErrorState,
  notFoundComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground">Guide Not Found</h1>
        <Link to="/distress-feed/guides" className="mt-6 inline-block text-sm font-semibold text-primary">
          Browse all guides
        </Link>
      </div>
    </MarketingLayout>
  ),
});

function GuideDetail() {
  const { guide } = Route.useLoaderData();
  const label = recordTypeLabel(guide.record_type);
  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">Distress Feed</Link> /{" "}
          <Link to="/distress-feed/guides" className="hover:text-primary">Guides</Link> /{" "}
          <Link to="/distress-feed/guides/$state" params={{ state: guide.state.toLowerCase() }} className="hover:text-primary">
            {guide.state}
          </Link>{" "}
          / {guide.county} County
        </nav>

        <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-foreground">
          {guide.title ?? `How to Pull ${label} Records in ${guide.county} County`}
        </h1>
        {guide.intro ? <p className="mt-5 text-lg text-muted-foreground">{guide.intro}</p> : null}

        <a
          href={guide.portal_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center gap-2 rounded-2xl border border-border bg-surface-muted px-5 py-4 font-mono text-sm text-primary hover:border-primary"
        >
          <ExternalLink className="h-4 w-4" /> {guide.portal_url}
        </a>

        <ol className="mt-10 space-y-6">
          {guide.steps.map((s: { heading?: string; body: string }, i: number) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
                {i + 1}
              </span>
              <div>
                {s.heading ? <h2 className="font-display font-bold text-foreground">{s.heading}</h2> : null}
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {guide.fields.length ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold text-foreground">Fields You'll Get</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {guide.fields.map((f: string) => (
                <li key={f} className="rounded-xl border border-border bg-surface px-4 py-2 text-sm text-muted-foreground">
                  {f}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {guide.notes ? (
          <p className="mt-8 rounded-2xl border border-border bg-surface-muted px-5 py-4 text-sm text-muted-foreground">
            {guide.notes}
          </p>
        ) : null}

        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-display text-xl font-bold text-foreground">Skip The Manual Work</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            LeadTrace pulls this every morning — enriched, DNC scrubbed and skip traced, ready to text.
          </p>
          <Button asChild className="mt-4">
            <Link to="/distress-feed">
              See the Distress Feed <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Link
          to="/distress-feed/counties/$state/$county"
          params={{ state: guide.state.toLowerCase(), county: countySlug(guide.county) }}
          className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          {guide.county} County records overview <ArrowRight className="h-4 w-4" />
        </Link>
      </article>
    </MarketingLayout>
  );
}
