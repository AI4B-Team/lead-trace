import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("legal")!;

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal Services Leads — LeadTrace" },
      { name: "description", content: "Probate, foreclosure, and business formation cases. Bar-compliant SMS with automatic litigator scrubbing." },
      { property: "og:title", content: "Legal Services Leads — LeadTrace" },
      { property: "og:description", content: "Probate, foreclosure, and business formation cases. Bar-compliant SMS with automatic litigator scrubbing." },
    ],
    links: [{ rel: "canonical", href: "/legal" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
