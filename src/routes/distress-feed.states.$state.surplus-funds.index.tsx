import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { RouteErrorState } from "@/components/route-error";
import {
  AggregateBlock,
  Breadcrumbs,
  CountyTable,
  Disclaimer,
  FaqList,
  HowToClaim,
  LawAtAGlance,
  Prose,
  RelatedRecordTypes,
  Section,
} from "@/components/marketing/surplus/guide-sections";
import { getSurplusStatePage } from "@/lib/surplus/public.functions";
import { canonicalUrl } from "@/lib/seo";
import { stateName } from "@/lib/state-guides.shared";

export const Route = createFileRoute("/distress-feed/states/$state/surplus-funds/")({
  loader: async ({ params }) => {
    if (params.state.length !== 2) throw notFound();
    const data = await getSurplusStatePage({ data: { state: params.state.toUpperCase() } });
    return { ...data, stateName: stateName(data.state) };
  },
  head: ({ loaderData }) => {
    const d = loaderData;
    if (!d) return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    const url = canonicalUrl(`/distress-feed/states/${d.state.toLowerCase()}/surplus-funds`);
    // PUBLISHED GATE: an unpublished state has no authored prose, so it is
    // noindex and self-canonical rather than a thin indexable stub.
    if (!d.rules) {
      return {
        meta: [
          { title: `${d.stateName} Surplus Funds — Guide Coming Soon` },
          { name: "robots", content: "noindex" },
        ],
        links: [{ rel: "canonical", href: url }],
      };
    }
    const title = `${d.stateName} Surplus Funds: How To Claim Excess Proceeds`;
    const description = `How ${d.rules.primary_term} works in ${d.stateName}: who holds the money, the deadline to claim it, fee limits, and how to file with the clerk yourself.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        ...(d.faqs.length
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: d.faqs.map((f) => ({
                    "@type": "Question",
                    name: f.question,
                    acceptedAnswer: { "@type": "Answer", text: f.answer_md },
                  })),
                }),
              },
            ]
          : []),
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
              {
                "@type": "ListItem",
                position: 3,
                name: d.stateName,
                item: canonicalUrl(`/distress-feed/states/${d.state.toLowerCase()}`),
              },
              { "@type": "ListItem", position: 4, name: "Surplus Funds", item: url },
            ],
          }),
        },
      ],
    };
  },
  component: StateSurplusPage,
  errorComponent: RouteErrorState,
  notFoundComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">State Not Found</h1>
        <p className="mt-3 text-muted-foreground">
          <Link to="/distress-feed/states" className="underline underline-offset-4">
            Browse all state guides
          </Link>
        </p>
      </div>
    </MarketingLayout>
  ),
});

function StateSurplusPage() {
  const { state, stateName: name, rules, aggregate, counties, faqs } = Route.useLoaderData();
  const stateSlug = state.toLowerCase();

  if (!rules) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold">{name} Surplus Funds Guide</h1>
          <p className="mt-3 text-muted-foreground">
            We publish a surplus funds guide only after a researcher has verified the state's
            statute and the clerk offices that hold the money. {name} is still in review.
          </p>
          <p className="mt-6">
            <Link to="/distress-feed/states" className="underline underline-offset-4">
              See the states we cover today
            </Link>
          </p>
        </div>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-4xl px-6 py-12">
        <Breadcrumbs
          crumbs={[
            { name: "Distress Feed", to: "/distress-feed" },
            { name: "States", to: "/distress-feed/states" },
            { name: `${name} Surplus Funds`, to: "." },
          ]}
        />

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {name} Surplus Funds and Excess Proceeds
        </h1>
        {rules.term_aliases.length ? (
          <p className="mt-3 text-muted-foreground">
            Also called {rules.term_aliases.join(", ")} in {name}.
          </p>
        ) : null}

        <div className="mt-8">
          {aggregate ? <AggregateBlock aggregate={aggregate} scopeLabel={name} /> : null}
        </div>

        <Section title={`What ${rules.primary_term} Is`}>
          <Prose>{rules.overview_md}</Prose>
        </Section>

        <Section title={`${name} Law at a Glance`}>
          <LawAtAGlance rules={rules} stateLabel={name} />
          {rules.last_verified_at ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Last verified {rules.last_verified_at}.
            </p>
          ) : null}
        </Section>

        <Section id="how-to-claim" title={`How To Claim ${rules.primary_term} in ${name}`}>
          <HowToClaim rules={rules} scopeLabel={name} />
        </Section>

        <Section title={`Where the Money Is Held — ${counties.length} ${name} Counties`}>
          <CountyTable counties={counties} stateSlug={stateSlug} />
        </Section>

        {faqs.length ? (
          <Section title="Common Questions">
            <FaqList faqs={faqs} />
          </Section>
        ) : null}

        <Section title={`Other ${name} Distress Records`}>
          <RelatedRecordTypes stateSlug={stateSlug} scopeLabel={name} />
        </Section>

        <Disclaimer />
      </article>
    </MarketingLayout>
  );
}