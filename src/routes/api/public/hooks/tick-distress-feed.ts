// Nightly pull for the maintained Distress Feed. One pull per county per record
// type serves every customer who wants that county.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-distress-feed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-distress-feed", 43200, async () => {
          const { runNightlyPulls } = await import("@/lib/distress-feed.server");
          const pulls = await runNightlyPulls();
          // Clerk-primary surplus: counties whose OWN published list carries a
          // confirmed surplus amount (Marion PDF, etc.). RealAuction cannot
          // serve these (JS-rendered items + robots.txt disallow), so the clerk
          // list is the primary source. Writes confirmed surplus_funds rows
          // straight into distress_records. Runs BEFORE the confirmation sweep.
          const { sweepClerkSurplusSources } = await import("@/lib/surplus/clerk-primary.server");
          // includeUnverified: candidate clerk lists (e.g. Sumter, whose page is
          // the right shape but currently empty) are parsed for reporting only —
          // a non-'live' source still writes nothing. This is how we notice the
          // day a watched county's list starts carrying rows.
          const clerkSurplus = await sweepClerkSurplusSources({ includeUnverified: true });
          // Confirmations run after the pull so a clerk row can reconcile
          // against the auction record derived in the same cycle.
          const { sweepSurplusSources } = await import("@/lib/surplus/confirm.server");
          const surplus = await sweepSurplusSources({ includeUnverified: true });
          return {
            ...pulls,
            clerkSurplus: clerkSurplus.results,
            surplusConfirmations: surplus.results,
            // Watched (non-live) sources that parsed rows this cycle are ready
            // for promotion review.
            surplusWatchReady: clerkSurplus.results
              .filter((r) => (r.skipped ?? "").startsWith("Source is") && (r.withAmount ?? 0) > 0)
              .map((r) => ({ county: r.county, state: r.state, rows: r.withAmount })),
          };
        });
      },
    },
  },
});
