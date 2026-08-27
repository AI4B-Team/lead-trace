import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TRIAL_CREDITS: Record<string, number> = { scrape: 1000, skip_trace: 500, sms: 250 };

/**
 * Workspace creation is server-only: the owner membership row and the starter
 * credit grant are privileged writes, so clients can never mint roles or
 * credits for themselves. The free-plan limit trigger still applies.
 */
export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(80).default("My Workspace"),
        industry: z.string().trim().max(40).optional(),
        starterCredits: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const insert: Record<string, unknown> = { name: data.name };
    if (data.industry) insert.industry = data.industry;
    if (data.starterCredits) insert.plan = "starter";

    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .insert(insert as never)
      .select("id")
      .single();
    if (wsErr) throw new Error(wsErr.message);

    const { error: memErr } = await supabaseAdmin
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: context.userId, role: "owner" });
    if (memErr) {
      await supabaseAdmin.from("workspaces").delete().eq("id", ws.id);
      throw new Error(memErr.message);
    }

    if (data.starterCredits) {
      const { applyCreditDelta } = await import("./credits.server");
      for (const [kind, amount] of Object.entries(TRIAL_CREDITS)) {
        await applyCreditDelta(null, {
          workspaceId: ws.id,
          kind,
          delta: amount,
          reason: "starter_trial",
          actorUserId: context.userId,
        });
      }
    }

    // Per-user RealElite account (Tyler 2026-08-27 spec). No-op while the
    // 'realeflow_per_user_accounts' platform flag is OFF (the default) — the
    // super-admin toggle on Platform Overview is the only thing that turns it
    // on. Never blocks workspace creation: failures are recorded, not thrown.
    try {
      const { ensureRealeflowAccount } = await import("./realeflow/accounts.server");
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const email = u?.user?.email;
      if (email) {
        const fullName = (u?.user?.user_metadata?.full_name as string | undefined) ?? "";
        const [firstName, ...rest] = fullName.split(/\s+/);
        await ensureRealeflowAccount({
          userId: context.userId,
          email,
          firstName,
          lastName: rest.join(" "),
        });
      }
    } catch {
      // Flag off / vendor down — signup must always succeed regardless.
    }

    return { workspaceId: ws.id as string };
  });