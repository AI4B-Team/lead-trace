// Licensed-API sourcing for the Distress Feed (probate, tax liens, vacancy,
// pre-foreclosure, tax delinquent). The host kills invocations at ~25-30s, so
// each tick completes ~1 county (all enabled types) and checkpoints a cursor;
// the cron fires every 30 minutes (migration 20260826090000) to cycle all 67
// counties in ~1.5 days. Overlap guard 20 min < the 30-min cadence.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-realeflow-sourcing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-realeflow-sourcing", 1200, async () => {
          const { runRealeflowSourcing } = await import("@/lib/data-providers/realeflow-source.server");
          return runRealeflowSourcing();
        });
      },
    },
  },
});
