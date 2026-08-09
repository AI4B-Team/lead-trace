import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("medical")!;

export const Route = createFileRoute("/medical")({
  head: () => ({
    meta: [
      { title: "Medical & Wellness Leads — LeadTrace" },
      { name: "description", content: "Fill chairs, rebook lapsed patients. Med spa, dental, chiro, and clinic outreach with zero PHI stored." },
      { property: "og:title", content: "Medical & Wellness Leads — LeadTrace" },
      { property: "og:description", content: "Fill chairs, rebook lapsed patients. Med spa, dental, chiro, and clinic outreach with zero PHI stored." },
    ],
    links: [{ rel: "canonical", href: "/medical" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
