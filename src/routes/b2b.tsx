import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";
import { canonicalUrl } from "@/lib/seo";

const data = getIndustryLanding("b2b")!;

export const Route = createFileRoute("/b2b")({
  head: () => ({
    meta: [
      { title: "B2B & SaaS Prospecting — LeadTrace" },
      { name: "description", content: "Skip the $60K data stack. Own your prospect lists. Enriched emails, phones, and socials for every vertical." },
      { property: "og:title", content: "B2B & SaaS Prospecting — LeadTrace" },
      { property: "og:description", content: "Skip the $60K data stack. Own your prospect lists. Enriched emails, phones, and socials for every vertical." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/b2b") }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
