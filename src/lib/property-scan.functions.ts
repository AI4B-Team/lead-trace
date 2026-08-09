import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Monitor is a standing subscription against a saved list, not a build mode:
 * we re-score the same houses on a cadence and tell the operator when one gets
 * worse. It lives per-list under Lists, and it is Growth-tier and above.
 */
export const getListMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ listId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("monitor_subscriptions")
      .select("id, cadence, alert_on, active, next_run_at")
      .eq("list_id", data.listId)
      .maybeSingle();
    if (error) throw error;
    return { monitor: row ?? null };
  });

export const setListMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        listId: z.string().uuid(),
        active: z.boolean(),
        cadence: z.enum(["monthly", "quarterly"]).default("monthly"),
        alertOnTarp: z.boolean().default(true),
        distressDelta: z.number().int().min(5).max(50).default(15),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertWriter } = await import("./accountability.server");
    await assertWriter(context.supabase, data.workspaceId, context.userId, "Change Monitoring");
    const nextRun = new Date(
      Date.now() + (data.cadence === "monthly" ? 30 : 91) * 86_400_000,
    ).toISOString();

    const { error } = await context.supabase.from("monitor_subscriptions").upsert(
      {
        workspace_id: data.workspaceId,
        created_by: context.userId,
        list_id: data.listId,
        cadence: data.cadence,
        active: data.active,
        alert_on: { tarp_appeared: data.alertOnTarp, distress_delta: data.distressDelta },
        next_run_at: data.active ? nextRun : null,
      } as never,
      { onConflict: "list_id" },
    );
    if (error) throw error;
    return { ok: true, next_run_at: data.active ? nextRun : null };
  });

/** Quick-set outcome on a scanned lead. `already_renovated` labels a scoring miss. */
export const setLeadOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        resultId: z.string().uuid().nullable().default(null),
        leadRecordId: z.string().uuid().nullable().default(null),
        status: z.enum(["contacted", "responded", "appointment", "contracted", "closed", "dead"]),
        reason: z
          .enum(["already_renovated", "not_selling", "bad_number", "wrong_owner", "no_answer"])
          .nullable()
          .default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_outcomes").insert({
      workspace_id: data.workspaceId,
      result_id: data.resultId,
      lead_record_id: data.leadRecordId,
      set_by: context.userId,
      status: data.status,
      reason: data.reason,
    } as never);
    if (error) throw error;
    return { ok: true };
  });