// Daily check for workspaces whose monthly plan period has rolled over. Grants
// the new lead-credit allowance and expires the unused part of the old grant.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-plan-renewal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-plan-renewal", 43200, async () => {
          const { renewPlanCredits } = await import("@/lib/plan-renewal.server");
          return renewPlanCredits();
        });
      },
    },
  },
});
