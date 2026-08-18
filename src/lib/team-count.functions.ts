import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isWorkspaceMember } from "./access-checks";

/**
 * Seat count for the current workspace.
 *
 * The roster itself is admin-only at the row level, so a plain member can no
 * longer count rows client-side. Membership is verified here and only the
 * aggregate leaves the server — never any teammate's id or role.
 */
export const getTeamSize = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ size: number }> => {
    if (!(await isWorkspaceMember(context.supabase, data.workspaceId, context.userId))) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId);
    return { size: count ?? 1 };
  });