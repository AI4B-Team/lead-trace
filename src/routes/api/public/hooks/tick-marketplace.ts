// Marketplace Deals monitoring tick.
//
// Two paths, both driven from here so they never block each other:
//   FAST — due searches: collect, dedupe, filter, score, alert.
//   SLOW — enrichment queue: AI extraction + Comparable Listings, after alerts.
//
// The claim window is 45s so the schedule can be tightened to a ~1 minute tier
// without overlapping runs.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-marketplace")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-marketplace", 45, async () => {
          const { hasAnyCollector } = await import("@/lib/marketplace/collectors.server");
          const { runEnrichmentQueue } = await import("@/lib/marketplace/enrichment.server");

          // No source adapter exists yet, so there is nothing honest to collect.
          // The enrichment queue still drains (it works on stored listings).
          if (!hasAnyCollector()) {
            const enrichment = await runEnrichmentQueue(10);
            return { ok: true, skipped: "no_live_source_adapter", enrichment };
          }

          const { runDueChecks } = await import("@/lib/marketplace/monitor.server");
          const fast = await runDueChecks(25);
          const enrichment = await runEnrichmentQueue(20);
          return { ...fast, enrichment };
        });
      },
    },
  },
});
