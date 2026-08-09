/**
 * The worklist. Lead Scout nominations are work, not decisions: they arrive
 * here directly and a person either works them or dismisses them inline.
 * Nothing about a nomination is applied, sent or changed by approving it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWorklistNominations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), limit: z.number().int().min(1).max(50).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/access-checks");
    if (!(await isWorkspaceMember(context.supabase, data.workspaceId, context.userId))) {
      throw new Error("Forbidden");
    }
    const { data: rows, error } = await context.supabase
      .from("worklist_nominations")
      .select(
        "id, lead_id, score, reasons, signals, record_types, cold_start, nominated_at, lead_records(id, full_name, business_name, phone, phone_type, city, state, address, record_types)",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("status", "open")
      .order("nominated_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<Record<string, unknown>>;
    // Cold start is a property of the batch: if nothing urgent fired anywhere,
    // the score is not a ranking and the UI must not dress it up as one.
    const coldStart = list.length > 0 && list.every((r) => Boolean(r["cold_start"]));
    return {
      coldStart,
      nominations: list.map((r) => {
        const lead = (r["lead_records"] ?? null) as Record<string, unknown> | null;
        return {
          id: String(r["id"]),
          leadId: String(r["lead_id"]),
          score: Number(r["score"] ?? 0),
          reasons: ((r["reasons"] as string[] | null) ?? []) as string[],
          recordTypes: ((r["record_types"] as string[] | null) ?? []) as string[],
          coldStart: Boolean(r["cold_start"]),
          nominatedAt: (r["nominated_at"] as string | null) ?? null,
          name:
            (lead?.["business_name"] as string | null) ||
            (lead?.["full_name"] as string | null) ||
            (lead?.["address"] as string | null) ||
            (lead?.["phone"] as string | null) ||
            "Lead",
          phone: (lead?.["phone"] as string | null) ?? null,
          location: [lead?.["city"], lead?.["state"]].filter(Boolean).join(", "),
        };
      }),
    };
  });

/** Inline dismiss. One click, no review queue, no approval. */
export const dismissWorklistNomination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        nominationId: z.string().uuid(),
        status: z.enum(["dismissed", "worked"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/access-checks");
    if (!(await isWorkspaceMember(context.supabase, data.workspaceId, context.userId))) {
      throw new Error("Forbidden");
    }
    const { error } = await context.supabase
      .from("worklist_nominations")
      .update({
        status: data.status ?? "dismissed",
        dismissed_at: new Date().toISOString(),
        dismissed_by: context.userId,
      } as never)
      .eq("id", data.nominationId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });