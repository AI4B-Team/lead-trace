import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("mortgage")!;

export const Route = createFileRoute("/mortgage")({
  head: () => ({
    meta: [
      { title: "Mortgage & Lending Leads — LeadTrace" },
      { name: "description", content: "Refi candidates, first-time buyer zones, and realtor partners — no more overpaying for shared trigger leads." },
      { property: "og:title", content: "Mortgage & Lending Leads — LeadTrace" },
      { property: "og:description", content: "Refi candidates, first-time buyer zones, and realtor partners — no more overpaying for shared trigger leads." },
    ],
    links: [{ rel: "canonical", href: "/mortgage" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
