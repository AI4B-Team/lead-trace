// Cron entry point for the recurring-run engine: finds every list whose next
// run is due and pipelines it net-new.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runTick } = await import("@/lib/cron-auth.server");
        return runTick(request, "tick-jobs", 300, async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runDueLists, reclaimStalledRuns } = await import("@/lib/recurring.server");
          // Clear runs killed mid-flight first, so a stuck row can't look busy forever.
          const { reclaimed } = await reclaimStalledRuns(supabaseAdmin);
          const { ran } = await runDueLists(supabaseAdmin);
          return { ok: true, reclaimed: reclaimed.length, ran: ran.length, results: ran };
        });
      },
    },
  },
});
