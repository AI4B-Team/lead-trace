import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  apiAdminClient,
  authenticateApiRequest,
  hasScope,
  jsonResponse,
  resolveWorkspace,
} from "@/lib/api-auth.server";
import { checkApiRate, checkRunTriggerRate, tooManyRequests } from "@/lib/api-rate-limit.server";

// GET  /api/public/v1/jobs?workspace_id=  → list jobs
// POST /api/public/v1/jobs               → create (and optionally run) a job
const createSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  source_type: z.enum(["business", "records", "upload"]),
  name: z.string().min(1).max(160).optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  run: z.boolean().default(true),
});

export const Route = createFileRoute("/api/public/v1/jobs")({
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
          .from("jobs")
          .select("id, source_type, status, rows_in, rows_skiptraced, params, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ workspace_id: workspaceId, jobs: data ?? [] });
      },
      POST: async ({ request }) => {
        const caller = await authenticateApiRequest(request);
        if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);
        if (!hasScope(caller, "write")) {
          return jsonResponse({ error: "This key is read-only" }, 403);
        }
        const rate = await checkApiRate(caller);
        if (!rate.allowed) return tooManyRequests(rate.retryAfter, "Rate limit exceeded");

        let body: z.infer<typeof createSchema>;
        try {
          body = createSchema.parse(await request.json());
        } catch (err) {
          return jsonResponse({ error: err instanceof Error ? err.message : "Invalid body" }, 400);
        }

        const workspaceId = resolveWorkspace(caller, body.workspace_id);
        if (!workspaceId) return jsonResponse({ error: "No accessible workspace" }, 403);

        const runRate = await checkRunTriggerRate(workspaceId);
        if (!runRate.allowed) {
          return tooManyRequests(runRate.retryAfter, "Run trigger limit exceeded for this workspace");
        }

        const admin = apiAdminClient();
        const { data: job, error } = await admin
          .from("jobs")
          .insert({
            workspace_id: workspaceId,
            source_type: body.source_type,
            status: "queued",
            params: { ...body.params, name: body.name ?? "API Job" } as never,
          })
          .select("id, status")
          .single();
        if (error || !job) return jsonResponse({ error: error?.message ?? "Create failed" }, 500);

        if (body.run) {
          const { runJob } = await import("@/lib/pipeline.functions");
          try {
            await runJob({ data: { jobId: job.id } });
          } catch (err) {
            return jsonResponse(
              { job_id: job.id, status: "queued", run_error: err instanceof Error ? err.message : "Run failed" },
              202,
            );
          }
        }
        return jsonResponse({ job_id: job.id, workspace_id: workspaceId, ran: body.run }, 201);
      },
    },
  },
});