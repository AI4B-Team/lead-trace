// Clerk-primary surplus sweep on its own schedule. Clerks refresh their held-
// funds lists weekly (Hillsborough) or on sale days (Manatee, DeKalb), so this
// must not wait behind the 12-hour nightly Distress Feed lock.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-clerk-surplus")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-clerk-surplus", 900, async () => {
          const { sweepClerkSurplusSources } = await import("@/lib/surplus/clerk-primary.server");
          // includeUnverified: watched sources are parsed for reporting only —
          // a non-'live' source still writes nothing.
          const swept = await sweepClerkSurplusSources({ includeUnverified: true });
          const wrote = swept.results.filter((r) => (r.written ?? 0) > 0).length;
          return {
            ok: true,
            sources: swept.results.length,
            wrote,
            results: swept.results,
            watchReady: swept.results
              .filter((r) => (r.skipped ?? "").startsWith("Source is") && (r.withAmount ?? 0) > 0)
              .map((r) => ({ county: r.county, state: r.state, rows: r.withAmount })),
          };
        });
      },
    },
  },
});
