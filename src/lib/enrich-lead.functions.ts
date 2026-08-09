// On-demand, per-lead enrichment (boss directive 2026-08-03: "include it in
// our apps to enrich the data when its needed for certain lead types").
//
// One button on a lead row → one skip-trace provider call → the record gets
// owner name / mailing address / property intel (and phones, once Realeflow
// exposes their skip-trace contact data — the provider interface already
// carries `phones[]`/`emails[]`, so no UI change will be needed).
//
// Debits 1 skip_trace credit only when the trace actually succeeds.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const enrichLeadRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        leadRecordId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS-scoped client: queries only return rows the signed-in member can see.
    const { supabase, userId } = context;

    // On-demand enrichment spends a skip-trace credit, so it runs through the
    // same role + per-member cap gate as any other spend.
    const { assertSpendAllowed } = await import("./accountability.server");
    await assertSpendAllowed(supabase, data.workspaceId, userId, {
      amount: 1,
      action: "build_list",
      summary: "Skip Trace One Lead",
    });

    const { data: record } = await supabase
      .from("lead_records")
      .select(
        "id, full_name, business_name, phone, phone_type, email, address, city, state, zip, last_seen_job_id",
      )
      .eq("id", data.leadRecordId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!record) throw new Error("Lead Not Found");
    if (!record.address) {
      throw new Error("This lead has no property address to enrich from.");
    }

    const { getSkipTraceProvider } = await import("./skiptrace/provider.server");
    const provider = getSkipTraceProvider();
    const t = await provider.trace({
      ownerName: record.full_name,
      street: record.address,
      city: record.city,
      state: record.state,
      zip: record.zip,
    });

    // Fill gaps on the de-duplicated master record. Never overwrite data the
    // user already has — enrichment adds, it doesn't clobber.
    const patch: {
      full_name?: string;
      phone?: string;
      phone_type?: string;
      email?: string;
    } = {};
    if (t.ownerName && !record.full_name) patch.full_name = t.ownerName;
    if (t.phones[0] && !record.phone) {
      const { classifyLineType } = await import("./line-type");
      patch.phone = t.phones[0];
      patch.phone_type = classifyLineType(t.phones[0]);
    }
    if (t.emails[0] && !record.email) patch.email = t.emails[0];
    if (Object.keys(patch).length > 0) {
      await supabase
        .from("lead_records")
        .update(patch)
        .eq("id", record.id)
        .eq("workspace_id", data.workspaceId);
    }

    // Stack the intel onto the underlying list lead (source_meta.realeflow),
    // so exports and the RealeflowIntel card pick it up.
    const realeflowMeta = {
      provider: t.provider,
      address_hash: t.addressHash,
      owner_name: t.ownerName,
      mailing_street: t.mailingStreet,
      mailing_city: t.mailingCity,
      mailing_state: t.mailingState,
      mailing_zip: t.mailingZip,
      absentee_owner: t.absenteeOwner,
      ...t.extras,
      traced_at: t.tracedAt,
    };
    if (record.last_seen_job_id) {
      const { data: leadRow } = await supabase
        .from("leads")
        .select("id, source_meta")
        .eq("job_id", record.last_seen_job_id)
        .eq("workspace_id", data.workspaceId)
        .eq("address", record.address)
        .limit(1)
        .maybeSingle();
      if (leadRow) {
        await supabase
          .from("leads")
          .update({
            source_meta: {
              ...((leadRow.source_meta as Record<string, unknown>) ?? {}),
              realeflow: realeflowMeta,
            } as never,
          })
          .eq("id", leadRow.id);
      }
    }

    // 1 successful trace = 1 skip-trace credit.
    const { applyCreditDelta } = await import("./credits.server");
    await applyCreditDelta(null, {
      workspaceId: data.workspaceId,
      kind: "skip_trace",
      delta: -1,
      reason: "skiptrace:on_demand",
      actorUserId: userId,
    });

    return {
      ok: true as const,
      ownerName: t.ownerName,
      mailingStreet: t.mailingStreet,
      mailingCity: t.mailingCity,
      mailingState: t.mailingState,
      mailingZip: t.mailingZip,
      absenteeOwner: t.absenteeOwner,
      phoneFound: t.phones[0] ?? null,
      emailFound: t.emails[0] ?? null,
      propertyValue: (t.extras.property_value as number | null) ?? null,
      estimatedEquity: (t.extras.estimated_equity as number | null) ?? null,
    };
  });
