// Replays failed webhook deliveries on an exponential backoff (1m/5m/15m/60m).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-webhook-retries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-webhook-retries", 30, async () => {
          const { retryPendingWebhooks } = await import("@/lib/webhook-delivery.server");
          return retryPendingWebhooks();
        });
      },
    },
  },
});