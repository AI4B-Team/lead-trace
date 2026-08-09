import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  apiAdminClient,
  authenticateApiRequest,
  jsonResponse,
  resolveWorkspace,
} from "@/lib/api-auth.server";
import { checkApiRate, tooManyRequests } from "@/lib/api-rate-limit.server";

// GET  /api/public/v1/campaigns?workspace_id=  → list campaigns
// POST /api/public/v1/campaigns                → push a ready list into a campaign
const pushSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export const Route = createFileRoute("/api/public/v1/campaigns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await authenticateApiRequest(request);
        if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);
        const rate = await checkApiRate(caller);
        if (!rate.allowed) return tooManyRequests(rate.retryAfter, "Rate limit exceeded");
        const url = new URL(request.url);
        const workspaceId = resolveWorkspace(caller, url.searchParams.get("workspace_id"));
        if (!workspaceId) return jsonResponse({ error: "No accessible workspace" }, 403);

        const { data, error } = await apiAdminClient()
          .from("campaigns")
          .select("id, name, status, list_job_id, daily_cap, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ workspace_id: workspaceId, campaigns: data ?? [] });
      },
      POST: async ({ request }) => {
        const caller = await authenticateApiRequest(request);
        if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);

        let body: z.infer<typeof pushSchema>;
        try {
          body = pushSchema.parse(await request.json());
        } catch (err) {
          return jsonResponse({ error: err instanceof Error ? err.message : "Invalid body" }, 400);
        }

        const { data: job } = await apiAdminClient()
          .from("jobs")
          .select("id, workspace_id")
          .eq("id", body.job_id)
          .maybeSingle();
        if (!job || !caller.workspaceIds.includes(job.workspace_id)) {
          return jsonResponse({ error: "List not found" }, 404);
        }

        // Reuse the same server-enforced compliance gate the UI uses: only
        // `ready` jobs with clean leads can become a campaign.
        const { launchCampaignFromJob } = await import("@/lib/jobs.functions");
        try {
          const result = await launchCampaignFromJob({
            data: { jobId: body.job_id, name: body.name },
          });
          return jsonResponse(result, 201);
        } catch (err) {
          return jsonResponse({ error: err instanceof Error ? err.message : "Launch failed" }, 400);
        }
      },
    },
  },
});