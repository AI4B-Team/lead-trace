import { createFileRoute } from "@tanstack/react-router";
import { StreetScanPage } from "@/components/marketing/street-scan-page";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/ai-driving-for-dollars")({
  head: () => ({
    meta: [
      { title: "Street Scan — AI Driving For Dollars For Any Market" },
      {
        name: "description",
        content:
          "Scan an entire market for visibly distressed properties overnight. Scored on street imagery, confirmed against county records, enriched and skip traced.",
      },
      { property: "og:title", content: "Street Scan — AI Driving For Dollars" },
      {
        property: "og:description",
        content:
          "Every rundown house in your market, found overnight — scored on street-level imagery and confirmed against county records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/street-scan") }],
  }),
  component: StreetScanPage,
});
