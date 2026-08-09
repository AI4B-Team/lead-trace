import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("education")!;

export const Route = createFileRoute("/education")({
  head: () => ({
    meta: [
      { title: "Coaching & Education Leads — LeadTrace" },
      { name: "description", content: "Fill your cohort, book discovery calls. Ideal-client lists by trade, ZIP, or life stage." },
      { property: "og:title", content: "Coaching & Education Leads — LeadTrace" },
      { property: "og:description", content: "Fill your cohort, book discovery calls. Ideal-client lists by trade, ZIP, or life stage." },
    ],
    links: [{ rel: "canonical", href: "/education" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
