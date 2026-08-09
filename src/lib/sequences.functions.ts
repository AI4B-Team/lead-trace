import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./access-checks";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertSuperAdmin(supabase: any, userId: string) {
  if (!(await isSuperAdmin(supabase, userId))) throw new Error("Forbidden");
}

export type SequenceOverview = {
  counts: Array<{ status: string; count: number }>;
  upcoming: Array<{
    id: string;
    workspace: string;
    campaign: string;
    lead: string;
    step: number;
    sends: number;
    next_send_at: string | null;
    anchor_type: string;
  }>;
};

// Platform view of the sequence engine: status mix plus the next 100 sends.
export const getSequenceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SequenceOverview> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: all } = await supabaseAdmin
      .from("lead_sequence_state")
      .select("status");
    const counts = new Map<string, number>();
    for (const r of (all ?? []) as Array<{ status: string }>) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }

    const { data: due } = await supabaseAdmin
      .from("lead_sequence_state")
      .select("id, workspace_id, campaign_id, lead_id, current_step, sends_count, next_send_at, anchor_type")
      .eq("status", "active")
      .not("next_send_at", "is", null)
      .order("next_send_at")
      .limit(100);
    const rows = (due ?? []) as Array<Record<string, any>>;

    const wsIds = [...new Set(rows.map((r) => r.workspace_id))];
    const campIds = [...new Set(rows.map((r) => r.campaign_id))];
    const leadIds = [...new Set(rows.map((r) => r.lead_id))];

    const [{ data: wss }, { data: camps }, { data: leads }] = await Promise.all([
      wsIds.length
        ? supabaseAdmin.from("workspaces").select("id, name").in("id", wsIds)
        : Promise.resolve({ data: [] as any[] }),
      campIds.length
        ? supabaseAdmin.from("campaigns").select("id, name").in("id", campIds)
        : Promise.resolve({ data: [] as any[] }),
      leadIds.length
        ? supabaseAdmin.from("leads").select("id, full_name, business_name, phone").in("id", leadIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const wsName = new Map((wss ?? []).map((w: any) => [w.id, w.name]));
    const campName = new Map((camps ?? []).map((c: any) => [c.id, c.name]));
    const leadName = new Map(
      (leads ?? []).map((l: any) => [l.id, l.full_name || l.business_name || l.phone || "Contact"]),
    );

    return {
      counts: [...counts.entries()].map(([status, count]) => ({ status, count })),
      upcoming: rows.map((r) => ({
        id: r.id,
        workspace: wsName.get(r.workspace_id) ?? "—",
        campaign: campName.get(r.campaign_id) ?? "—",
        lead: leadName.get(r.lead_id) ?? "—",
        step: (r.current_step as number) + 1,
        sends: r.sends_count ?? 0,
        next_send_at: r.next_send_at,
        anchor_type: r.anchor_type ?? "none",
      })),
    };
  });
