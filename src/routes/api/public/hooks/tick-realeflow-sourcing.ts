// Nightly licensed-API sourcing for the Distress Feed (probate, tax liens,
// vacancy). Runs after the county scrapers.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-realeflow-sourcing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-realeflow-sourcing", 43200, async () => {
          const { runRealeflowSourcing } = await import("@/lib/data-providers/realeflow-source.server");
          return runRealeflowSourcing();
        });
      },
    },
  },
});
