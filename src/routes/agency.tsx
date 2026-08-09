import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("agency")!;

export const Route = createFileRoute("/agency")({
  head: () => ({
    meta: [
      { title: "White-Label Agency Platform — LeadTrace" },
      { name: "description", content: "Every client gets their own workspace, numbers, and compliance trail — under your brand, one flat rate." },
      { property: "og:title", content: "White-Label Agency Platform — LeadTrace" },
      { property: "og:description", content: "Every client gets their own workspace, numbers, and compliance trail — under your brand, one flat rate." },
    ],
    links: [{ rel: "canonical", href: "/agency" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
