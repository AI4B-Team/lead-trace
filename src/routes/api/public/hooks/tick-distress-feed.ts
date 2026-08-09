// Nightly pull for the maintained Distress Feed. One pull per county per record
// type serves every customer who wants that county.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-distress-feed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-distress-feed", 43200, async () => {
          const { runNightlyPulls } = await import("@/lib/distress-feed.server");
          return runNightlyPulls();
        });
      },
    },
  },
});
