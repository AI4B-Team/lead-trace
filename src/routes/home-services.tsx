import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";
import { canonicalUrl } from "@/lib/seo";

const data = getIndustryLanding("home-services")!;

export const Route = createFileRoute("/home-services")({
  head: () => ({
    meta: [
      { title: "Home Services Leads — LeadTrace" },
      { name: "description", content: "HVAC, plumbing, electrical, and contractor leads by neighborhood. Fill the truck with local jobs this week." },
      { property: "og:title", content: "Home Services Leads — LeadTrace" },
      { property: "og:description", content: "HVAC, plumbing, electrical, and contractor leads by neighborhood. Fill the truck with local jobs this week." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/home-services") }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
