// Daily canary for the Template Health Agent. Each canary runs a capped, fixed
// known-good request and records per-field fill rates.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-template-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        // Optional ?only=key1,key2 lets an operator re-run specific canaries.
        const only = (new URL(request.url).searchParams.get("only") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return runTick(request, only.length ? "tick-template-health-only" : "tick-template-health", only.length ? 60 : 43200, async () => {
          const { runTemplateHealthCanaries } = await import("@/lib/template-health.server");
          return runTemplateHealthCanaries(only.length ? { only } : {});
        });
      },
    },
  },
});
