import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingState = {
  welcomeDismissed: boolean;
  checklistCollapsed: boolean;
  reviewedCleanList: boolean;
  firstRunDismissed: boolean;
  /** True while THIS workspace is still empty and unset-up (per-workspace first run). */
  firstRun: boolean;
  hasJob: boolean;
  hasBrand: boolean;
  hasAgent: boolean;
  hasNumbers: boolean;
  hasCampaign: boolean;
};

/**
 * Reads onboarding prefs plus the auto-checked activation milestones.
 * First-run state is keyed to workspace setup completeness, never account age —
 * every workspace has its own 10DLC brand, numbers, agent and suppression.
 */
export const getOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OnboardingState> => {
    const ws = data.workspaceId;
    const count = (table: "jobs" | "brands" | "sending_numbers" | "campaigns" | "registrations") =>
      // registrations is keyed by workspace_id (no id column) — count on workspace_id.
      context.supabase.from(table).select("workspace_id", { count: "exact", head: true }).eq("workspace_id", ws);

    const [prefs, wsPrefs, jobs, brands, numbers, campaigns, registrations] = await Promise.all([
      context.supabase
        .from("user_prefs")
        .select("welcome_dismissed, checklist_collapsed, reviewed_clean_list, first_run_dismissed")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("workspace_onboarding")
        .select("first_run_dismissed")
        .eq("workspace_id", ws)
        .eq("user_id", context.userId)
        .maybeSingle(),
      count("jobs"),
      count("brands"),
      count("sending_numbers"),
      count("campaigns"),
      count("registrations"),
    ]);

    const dismissed = Boolean(wsPrefs.data?.first_run_dismissed);
    const hasData = (jobs.count ?? 0) > 0 || (campaigns.count ?? 0) > 0;
    const untouched =
      !hasData && (brands.count ?? 0) === 0 && (numbers.count ?? 0) === 0 && (registrations.count ?? 0) === 0;

    return {
      welcomeDismissed: Boolean(prefs.data?.welcome_dismissed),
      checklistCollapsed: Boolean(prefs.data?.checklist_collapsed),
      reviewedCleanList: Boolean(prefs.data?.reviewed_clean_list),
      firstRunDismissed: dismissed,
      firstRun: untouched && !dismissed,
      hasJob: (jobs.count ?? 0) > 0,
      hasBrand: (registrations.count ?? 0) > 0,
      hasAgent: (brands.count ?? 0) > 0,
      hasNumbers: (numbers.count ?? 0) > 0,
      hasCampaign: (campaigns.count ?? 0) > 0,
    };
  });

/**
 * Landing decision, routed by WORKSPACE state — never a fixed page and never
 * account age. A brand-new (or freshly created) empty workspace goes to Build,
 * the fastest path to first value, with the send-side setup checklist alongside.
 * Once the workspace has lists/campaigns — or the checklist is dismissed — that
 * workspace defaults to the Dashboard on later entries.
 */
export const getLandingTarget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ target: "assistant" | "dashboard"; firstRun: boolean }> => {
    const ws = data.workspaceId;
    const count = (table: "jobs" | "campaigns" | "brands" | "sending_numbers" | "registrations") =>
      // registrations is keyed by workspace_id (no id column) — count on workspace_id.
      context.supabase.from(table).select("workspace_id", { count: "exact", head: true }).eq("workspace_id", ws);

    const [prefs, jobs, campaigns, brands, numbers, registrations] = await Promise.all([
      context.supabase
        .from("workspace_onboarding")
        .select("first_run_dismissed")
        .eq("workspace_id", ws)
        .eq("user_id", context.userId)
        .maybeSingle(),
      count("jobs"),
      count("campaigns"),
      count("brands"),
      count("sending_numbers"),
      count("registrations"),
    ]);

    const dismissed = Boolean(prefs.data?.first_run_dismissed);
    const hasData = (jobs.count ?? 0) > 0 || (campaigns.count ?? 0) > 0;
    const untouched =
      !hasData && (brands.count ?? 0) === 0 && (numbers.count ?? 0) === 0 && (registrations.count ?? 0) === 0;
    const firstRun = untouched && !dismissed;
    return { target: firstRun ? "assistant" : "dashboard", firstRun };
  });

export const setOnboardingPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        welcomeDismissed: z.boolean().optional(),
        checklistCollapsed: z.boolean().optional(),
        reviewedCleanList: z.boolean().optional(),
        firstRunDismissed: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // First-run dismissal is per workspace: dismissing it for one business must
    // not skip setup for the next workspace the user spins up.
    if (data.firstRunDismissed !== undefined && data.workspaceId) {
      const { error } = await context.supabase.from("workspace_onboarding").upsert(
        {
          workspace_id: data.workspaceId,
          user_id: context.userId,
          first_run_dismissed: data.firstRunDismissed,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "workspace_id,user_id" },
      );
      if (error) throw error;
    }
    const patch: Record<string, boolean> = {};
    if (data.welcomeDismissed !== undefined) patch.welcome_dismissed = data.welcomeDismissed;
    if (data.checklistCollapsed !== undefined) patch.checklist_collapsed = data.checklistCollapsed;
    if (data.reviewedCleanList !== undefined) patch.reviewed_clean_list = data.reviewedCleanList;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("user_prefs")
      .upsert({ user_id: context.userId, ...patch } as never, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });
