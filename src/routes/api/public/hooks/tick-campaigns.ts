// Cron-driven auto-runner. pg_cron hits this every minute with the private
// cron secret in the `x-cron-secret` header (never the public app key), then we
// dispatch a batch for every campaign in `sending` status.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-campaigns", 45, async () => {
          const { tickAllSendingCampaigns } = await import("@/lib/campaign-runner.server");
          return tickAllSendingCampaigns();
        });
      },
    },
  },
});
