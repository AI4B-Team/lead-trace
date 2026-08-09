// Once-daily rollup of blocked sends, DNC hits and quiet-hours blocks.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-compliance-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-compliance-digest", 60 * 20, async () => {
          const { runComplianceDigest } = await import("@/lib/compliance-digest.server");
          return runComplianceDigest();
        });
      },
    },
  },
});
