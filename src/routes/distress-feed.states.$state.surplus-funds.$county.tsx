import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ExternalLink, Phone } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { RouteErrorState } from "@/components/route-error";
import {
  AggregateBlock,
  Breadcrumbs,
  Disclaimer,
  FaqList,
  HowToClaim,
  LawAtAGlance,
  Prose,
  RelatedRecordTypes,
  Section,
  usd0,
} from "@/components/marketing/surplus/guide-sections";
import { getSurplusCountyPage } from "@/lib/surplus/public.functions";
import { canonicalUrl } from "@/lib/seo";
import { stateName } from "@/lib/state-guides.shared";

export const Route = createFileRoute("/distress-feed/states/$state/surplus-funds/$county")({
  loader: async ({ params }) => {
    if (params.state.length !== 2) throw notFound();
    const data = await getSurplusCountyPage({
      data: { state: params.state.toUpperCase(), county: params.county },
    });
    // A county page exists only when both the state guide and the county's
    // clerk record are published — anything else is a real 404, not a stub.
    if (!data.rules || !data.county) throw notFound();
    return { ...data, stateName: stateName(data.state) };
  },
  head: ({ loaderData }) => {
    const d = loaderData;
    if (!d?.county || !d.rules) {
      return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    }
    const scope = `${d.county.name} County`;
    const url = canonicalUrl(
      `/distress-feed/states/${d.state.toLowerCase()}/surplus-funds/${d.county.slug}`,
    );
    const title = `${scope}, ${d.state} Surplus Funds — Claim Excess Proceeds`;
    const description = `Who holds ${scope} surplus funds, the deadline to claim them, and how to file directly with ${
      d.county.clerkOfficeName ?? "the clerk"
    } without paying a recovery fee.`;
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
        ...(d.county.clerkOfficeName
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "GovernmentService",
                  name: `${scope} Surplus Funds Claims`,
                  serviceType: "Surplus funds claim",
                  areaServed: { "@type": "AdministrativeArea", name: `${scope}, ${d.state}` },
                  provider: { "@type": "GovernmentOrganization", name: d.county.clerkOfficeName },
                  ...(d.county.officialListUrl ? { url: d.county.officialListUrl } : {}),
                }),
              },
            ]
          : []),
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
                name: `${stateName(d.state)} Surplus Funds`,
                item: canonicalUrl(
                  `/distress-feed/states/${d.state.toLowerCase()}/surplus-funds`,
                ),
              },
              { "@type": "ListItem", position: 4, name: scope, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: CountySurplusPage,
  errorComponent: RouteErrorState,
  notFoundComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">County Guide Not Found</h1>
        <p className="mt-3 text-muted-foreground">
          <Link to="/distress-feed/states" className="underline underline-offset-4">
            Browse all state guides
          </Link>
        </p>
      </div>
    </MarketingLayout>
  ),
});

function CountySurplusPage() {
  const { state, stateName: name, rules, county, aggregate, nearby, faqs } =
    Route.useLoaderData();
  if (!rules || !county) return null;
  const stateSlug = state.toLowerCase();
  const scope = `${county.name} County`;

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-4xl px-6 py-12">
        <Breadcrumbs
          crumbs={[
            { name: "Distress Feed", to: "/distress-feed" },
            { name: "States", to: "/distress-feed/states" },
            { name: scope, to: "." },
          ]}
        />

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="block">
            {scope}, {state}
          </span>
          <span className="block">Surplus Funds and Excess Proceeds</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Part of the{" "}
          <Link
            to="/distress-feed/states/$state/surplus-funds"
            params={{ state: stateSlug }}
            className="underline underline-offset-4"
          >
            {name} surplus funds guide
          </Link>
          .
        </p>

        <div className="mt-8">
          {aggregate ? <AggregateBlock aggregate={aggregate} scopeLabel={scope} /> : null}
        </div>

        <Section title="The Office Holding the Funds">
          <div className="rounded-lg border p-6">
            <h3 className="font-medium">{county.clerkOfficeName ?? rules.clerk_title}</h3>
            {county.clerkAddress.length ? (
              <address className="mt-2 text-sm not-italic leading-relaxed text-muted-foreground">
                {county.clerkAddress.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </address>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              {county.clerkPhone ? (
                <a
                  href={`tel:${county.clerkPhone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  {county.clerkPhone}
                </a>
              ) : null}
              {county.officialListUrl ? (
                <a
                  href={county.officialListUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
                >
                  Open the Official {scope} List
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              ) : null}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              This office is the authoritative source for claim procedures and deadlines. Verify
              anything on this page against it.
              {county.verifiedAt ? ` Last verified ${county.verifiedAt}.` : ""}
            </p>
          </div>
        </Section>

        <Section title={`What ${rules.primary_term} Is`}>
          <Prose>{rules.overview_md}</Prose>
        </Section>

        <Section title={`${name} Law at a Glance`}>
          <LawAtAGlance rules={rules} stateLabel={name} />
          <p className="mt-3 text-xs text-muted-foreground">
            These rules apply statewide, including in {scope}.
            {rules.last_verified_at ? ` Last verified ${rules.last_verified_at}.` : ""}
          </p>
        </Section>

        <Section id="how-to-claim" title={`How To Claim in ${scope}`}>
          <HowToClaim
            rules={rules}
            scopeLabel={name}
            officialListUrl={county.officialListUrl}
            clerkOfficeName={county.clerkOfficeName}
          />
        </Section>

        {county.claimProcessMd ? (
          <Section title={`${scope}'s Own Claim Process`}>
            <Prose>{county.claimProcessMd}</Prose>
          </Section>
        ) : null}

        {faqs.length ? (
          <Section title={`Questions About ${scope} Claims`}>
            <FaqList faqs={faqs} />
          </Section>
        ) : null}

        {nearby.length ? (
          <Section title="Nearby Counties">
            <ul className="grid gap-3 sm:grid-cols-2">
              {nearby.map((n) => (
                <li key={n.slug}>
                  <Link
                    to="/distress-feed/states/$state/surplus-funds/$county"
                    params={{ state: stateSlug, county: n.slug }}
                    className="block rounded-lg border p-4 hover:bg-muted/40"
                  >
                    <span className="font-medium">{n.name} County</span>
                    <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                      {usd0.format(n.totalAmount)} across {n.recordCount.toLocaleString()} cases
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
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