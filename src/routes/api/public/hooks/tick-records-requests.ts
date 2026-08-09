// Cron entry point for the Public Records Request scheduler. One request per
// agency per cycle, sent by LeadTrace — never one per user.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-records-requests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-records-requests", 3600, async () => {
          const { sendDueRequests } = await import("@/lib/records-requests.server");
          return sendDueRequests();
        });
      },
    },
  },
});
