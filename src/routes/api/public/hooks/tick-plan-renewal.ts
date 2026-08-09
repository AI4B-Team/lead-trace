// Daily check for workspaces whose monthly plan period has rolled over. Grants
// the new lead-credit allowance and expires the unused part of the old grant.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tick-plan-renewal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireCronAuth, claimTick } = await import("@/lib/cron-auth.server");
        const denied = await requireCronAuth(request);
        if (denied) return denied;

        if (!(await claimTick("tick-plan-renewal", 43_200))) {
          return Response.json({ ok: true, skipped: "tick_in_progress" }, { status: 202 });
        }

        try {
          const { renewPlanCredits } = await import("@/lib/plan-renewal.server");
          return Response.json(await renewPlanCredits());
        } catch (err) {
          const message = err instanceof Error ? err.message : "Plan Renewal Failed";
          console.error("tick-plan-renewal failed:", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
