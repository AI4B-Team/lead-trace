import { createFileRoute, notFound } from "@tanstack/react-router";
import { LeadLandingPage } from "@/components/marketing/lead-landing-page";
import { getLeadPage, type LeadPage } from "@/lib/lead-pages";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";

export const Route = createFileRoute("/leads/$slug")({
  loader: ({ params }) => {
    const page = getLeadPage(params.slug);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData }) => {
    const page = (loaderData as { page: LeadPage } | undefined)?.page;
    if (!page) return {};
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };
    return {
      meta: [
        { title: page.metaTitle },
        { name: "description", content: page.metaDescription },
        { property: "og:title", content: page.metaTitle },
        { property: "og:description", content: page.metaDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(faqSchema) }],
      links: [{ rel: "canonical", href: `/leads/${page.slug}` }],
    };
  },
  component: LeadPageRoute,
  errorComponent: RouteErrorState,
  notFoundComponent: () => <RouteNotFoundState />,
});

function LeadPageRoute() {
  const { page } = Route.useLoaderData();
  return <LeadLandingPage page={page} />;
}
