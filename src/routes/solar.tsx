import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("solar")!;

export const Route = createFileRoute("/solar")({
  head: () => ({
    meta: [
      { title: "Solar & Roofing Leads — LeadTrace" },
      { name: "description", content: "Homeowner and storm-response lists with roof-age filters. Book inspections from local numbers with reply-stop SMS." },
      { property: "og:title", content: "Solar & Roofing Leads — LeadTrace" },
      { property: "og:description", content: "Homeowner and storm-response lists with roof-age filters. Book inspections from local numbers with reply-stop SMS." },
    ],
    links: [{ rel: "canonical", href: "/solar" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
