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
          const { runDueLists } = await import("@/lib/recurring.server");
          const { ran } = await runDueLists(supabaseAdmin);
          return { ok: true, ran: ran.length, results: ran };
        });
      },
    },
  },
});
