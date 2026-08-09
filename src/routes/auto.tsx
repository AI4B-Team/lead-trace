import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("auto")!;

export const Route = createFileRoute("/auto")({
  head: () => ({
    meta: [
      { title: "Auto Dealer & Detail Leads — LeadTrace" },
      { name: "description", content: "Lease-end buybacks, service reactivation, and fleet accounts. Move more inventory, book more service bays." },
      { property: "og:title", content: "Auto Dealer & Detail Leads — LeadTrace" },
      { property: "og:description", content: "Lease-end buybacks, service reactivation, and fleet accounts. Move more inventory, book more service bays." },
    ],
    links: [{ rel: "canonical", href: "/auto" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
