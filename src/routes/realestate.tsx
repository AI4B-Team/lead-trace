import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("realestate")!;

export const Route = createFileRoute("/realestate")({
  head: () => ({
    meta: [
      { title: "Real Estate Lead Generation — LeadTrace" },
      { name: "description", content: "Find distressed properties before anyone else. Probate, pre-foreclosure, code violations, and absentee owners — scored and skip-traced." },
      { property: "og:title", content: "Real Estate Lead Generation — LeadTrace" },
      { property: "og:description", content: "Distressed property leads pulled from live code enforcement data — scored, skip-traced, ready to contact." },
    ],
    links: [{ rel: "canonical", href: "/realestate" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});