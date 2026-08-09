// Cron-driven multi-touch sequence runner. Touch 1 is sent by tick-campaigns;
// every later touch is dispatched here.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-sequences")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-sequences", 240, async () => {
          const { runSequenceTick } = await import("@/lib/sequence-runner.server");
          return runSequenceTick();
        });
      },
    },
  },
});
