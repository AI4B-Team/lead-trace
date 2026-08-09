// Daily canary for the Template Health Agent. Each canary runs a capped, fixed
// known-good request and records per-field fill rates.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-template-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-template-health", 43200, async () => {
          const { runTemplateHealthCanaries } = await import("@/lib/template-health.server");
          return runTemplateHealthCanaries();
        });
      },
    },
  },
});
