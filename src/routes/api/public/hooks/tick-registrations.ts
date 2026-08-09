// Nightly 10DLC status reconciliation. Carrier vetting is asynchronous and has
// no reliable callback, so we poll every workspace still marked "submitted".
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-registrations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-registrations", 43200, async () => {
          const { syncPendingRegistrations } = await import("@/lib/registration-sync.server");
          return syncPendingRegistrations();
        });
      },
    },
  },
});
