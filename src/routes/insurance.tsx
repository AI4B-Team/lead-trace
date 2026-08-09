import { createFileRoute } from "@tanstack/react-router";
import { IndustryLandingPage } from "@/components/marketing/industry-landing";
import { getIndustryLanding } from "@/lib/industry-landings";

const data = getIndustryLanding("insurance")!;

export const Route = createFileRoute("/insurance")({
  head: () => ({
    meta: [
      { title: "Insurance Lead Generation — LeadTrace" },
      { name: "description", content: "Medicare T65, final expense, commercial P&C, and auto switcher lists — DNC and litigator scrubbed, 10DLC compliant." },
      { property: "og:title", content: "Insurance Lead Generation — LeadTrace" },
      { property: "og:description", content: "Medicare T65, final expense, commercial P&C, and auto switcher lists — DNC and litigator scrubbed, 10DLC compliant." },
    ],
    links: [{ rel: "canonical", href: "/insurance" }],
  }),
  component: () => <IndustryLandingPage data={data} />,
});
