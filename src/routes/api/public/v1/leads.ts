import { createFileRoute } from "@tanstack/react-router";
import {
  apiAdminClient,
  authenticateApiRequest,
  jsonResponse,
  resolveWorkspace,
} from "@/lib/api-auth.server";
import { checkApiRate, tooManyRequests } from "@/lib/api-rate-limit.server";

// GET /api/public/v1/leads?workspace_id=&disposition=clean&limit=200
export const Route = createFileRoute("/api/public/v1/leads")({
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

        const disposition = url.searchParams.get("disposition");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 500);

        let q = apiAdminClient()
          .from("lead_records")
          .select(
            "id, full_name, business_name, phone, phone_type, email, city, state, disposition, source_types, list_count, first_seen_at, last_seen_at",
          )
          .eq("workspace_id", workspaceId)
          .order("last_seen_at", { ascending: false })
          .limit(limit);
        if (disposition && disposition !== "all") q = q.eq("disposition", disposition);

        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ workspace_id: workspaceId, leads: data ?? [] });
      },
    },
  },
});