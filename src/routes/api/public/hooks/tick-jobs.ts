// Cron entry point for the recurring-run engine: finds every list whose next
// run is due and pipelines it net-new.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-jobs", 300, async () => {
          const { runDueLists } = await import("@/lib/recurring.server");
          return runDueLists();
        });
      },
    },
  },
});
