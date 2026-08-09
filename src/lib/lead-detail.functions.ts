// Lead detail drawer data: the de-duplicated master record, skip-trace /
// property intel stacked on the underlying list lead, message + call history,
// disposition outcome, and team notes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idInput = z.object({
  workspaceId: z.string().uuid(),
  leadRecordId: z.string().uuid(),
});

export const getLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: record, error } = await supabase
      .from("lead_records")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.leadRecordId)
      .maybeSingle();
    if (error) throw error;
    if (!record) throw new Error("Lead Not Found");

    // Underlying list leads for this record (matched the same way the master
    // de-dupes): phone first, then business name, then person name.
    let leadQ = supabase
      .from("leads")
      .select("id, job_id, source_meta, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (record.phone) leadQ = leadQ.eq("phone", record.phone);
    else if (record.business_name) leadQ = leadQ.eq("business_name", record.business_name);
    else if (record.full_name) leadQ = leadQ.eq("full_name", record.full_name);
    const { data: leadRows } = await leadQ;
    const leads = leadRows ?? [];

    // Skip-trace / property intel, newest first.
    let intel: Record<string, string | number | boolean | null> | null = null;
    for (const l of leads) {
      const meta = (l.source_meta as Record<string, unknown> | null) ?? null;
      const r = meta?.["realeflow"] as Record<string, string | number | boolean | null> | undefined;
      if (r) {
        intel = r;
        break;
      }
    }

    // Message + call history across every list lead for this contact.
    const leadIds = leads.map((l) => l.id);
    let messages: Array<{
      id: string;
      direction: string;
      channel: string;
      body: string | null;
      transcript: string | null;
      status: string | null;
      is_bot: boolean;
      is_optout: boolean | null;
      recording_seconds: number | null;
      created_at: string;
    }> = [];
    if (leadIds.length > 0) {
      const { data: msgs } = await supabase
        .from("messages")
        .select(
          "id, direction, channel, body, transcript, status, is_bot, is_optout, recording_seconds, created_at",
        )
        .eq("workspace_id", data.workspaceId)
        .in("lead_id", leadIds)
        .order("created_at", { ascending: true })
        .limit(200);
      messages = msgs ?? [];
    }

    const { data: outcome } = await supabase
      .from("lead_outcomes")
      .select("status, reason, updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("lead_record_id", data.leadRecordId)
      .maybeSingle();

    const { data: notes } = await supabase
      .from("lead_notes")
      .select("id, body, created_at, created_by")
      .eq("workspace_id", data.workspaceId)
      .eq("lead_record_id", data.leadRecordId)
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      record,
      intel,
      messages,
      outcome: outcome ?? null,
      notes: notes ?? [],
      primaryLeadId: leadIds[0] ?? null,
      listLeadCount: leadIds.length,
    };
  });

// A shortlisted record can be taken off the shortlist by any member who can
// work leads. Clearing it is a plain removal — the original agent proposal and
// the approval that put it there stay on the record in the activity feed.
export const clearLeadShortlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_records")
      .update({
        nominated_at: null,
        nominated_score: null,
        nominated_reason: null,
        nominated_by: null,
      } as never)
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.leadRecordId);
    if (error) throw error;
    return { ok: true as const };
  });

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    idInput.extend({ body: z.string().trim().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_notes").insert({
      workspace_id: data.workspaceId,
      lead_record_id: data.leadRecordId,
      body: data.body,
      created_by: context.userId,
    });
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), noteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_notes")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.noteId);
    if (error) throw error;
    return { ok: true as const };
  });