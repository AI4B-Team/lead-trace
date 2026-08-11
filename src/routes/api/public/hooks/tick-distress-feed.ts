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
          const pulls = await runNightlyPulls();
          // Confirmations run after the pull so a clerk row can reconcile
          // against the auction record derived in the same cycle.
          const { sweepSurplusSources } = await import("@/lib/surplus/confirm.server");
          const surplus = await sweepSurplusSources();
          return { ...pulls, surplusConfirmations: surplus.results };
        });
      },
    },
  },
});
