import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("ecommerce")!;

export const Route = createFileRoute("/ecommerce")({
  head: () => ({
    meta: [
      { title: "E-Commerce Wholesale Leads — LeadTrace" },
      { name: "description", content: "Find every boutique and retailer in your category. Pitch wholesale placements by SMS or email from one dashboard." },
      { property: "og:title", content: "E-Commerce Wholesale Leads — LeadTrace" },
      { property: "og:description", content: "Find every boutique and retailer in your category. Pitch wholesale placements by SMS or email from one dashboard." },
    ],
    links: [{ rel: "canonical", href: "/ecommerce" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
