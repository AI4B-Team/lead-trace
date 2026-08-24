import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// General workspace preferences. Writes go through the caller's own client so
// the "admins update workspace" policy decides who may change them.
export const getWorkspaceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ws, error } = await context.supabase
      .from("workspaces")
      .select("id, name, industry, timezone, default_state")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (error) throw error;
    return {
      name: ws?.name ?? "",
      industry: ws?.industry ?? "real_estate",
      timezone: ws?.timezone ?? "America/New_York",
      defaultState: ws?.default_state ?? "FL",
    };
  });

export const updateWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        industry: z.string().trim().min(1).max(60),
        timezone: z.string().trim().min(1).max(60),
        defaultState: z.string().trim().length(2),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspaces")
      .update({
        name: data.name,
        industry: data.industry,
        timezone: data.timezone,
        default_state: data.defaultState.toUpperCase(),
      })
      .eq("id", data.workspaceId);
    if (error) throw error;
    return { ok: true as const };
  });
