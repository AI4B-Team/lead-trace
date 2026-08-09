// Background agent scheduler. Runs every due agent across every workspace.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-agents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-agents", 240, async () => {
          const { runDueAgents } = await import("@/lib/agents/runner.server");
          return runDueAgents();
        });
      },
    },
  },
});