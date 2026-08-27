import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./access-checks";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertSuperAdmin(supabase: any, userId: string) {
  if (!(await isSuperAdmin(supabase, userId))) throw new Error("Forbidden");
}

/**
 * Per-user RealElite accounts — super-admin control surface.
 * The feature ships OFF; only a super_admin can activate it. While OFF the
 * whole integration keeps running on the single env test account.
 */

// Current flag state + provisioned-account stats for the admin card.
export const getRealeflowAccountsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { perUserAccountsEnabled } = await import("./realeflow/accounts.server");

    const enabled = await perUserAccountsEnabled();
    const [{ count: active }, { count: errored }] = await Promise.all([
      supabaseAdmin
        .from("realeflow_accounts")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("realeflow_accounts")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "error"),
    ]);
    return { enabled, activeAccounts: active ?? 0, erroredAccounts: errored ?? 0 };
  });

// Flip the flag. This is the ONLY way the feature turns on.
export const setRealeflowAccountsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { setPerUserAccountsEnabled } = await import("./realeflow/accounts.server");
    await setPerUserAccountsEnabled(data.enabled, context.userId);
    return { enabled: data.enabled };
  });
