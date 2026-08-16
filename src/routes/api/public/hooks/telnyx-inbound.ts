import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getProvider } from "@/lib/sms";

// Telnyx inbound-message webhook. Verifies signature, records the reply,
// halts the drip, and enforces STOP/HELP compliance. See Section 6 of the
// LeadTrace Telnyx build spec — these rules are non-configurable.
export const Route = createFileRoute("/api/public/hooks/telnyx-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const provider = getProvider();

        if (!(await provider.verifyWebhook(request, raw))) {
          return new Response("Invalid signature", { status: 403 });
        }

        // Telnyx delivers ALL messaging events to the profile's single
        // webhook_url, so non-inbound events (delivery receipts) are dispatched
        // to the DLR handler instead of being recorded as replies.
        let eventType = "";
        try {
          eventType = (JSON.parse(raw) as { data?: { event_type?: string } }).data?.event_type ?? "";
        } catch {
          eventType = "";
        }
        if (eventType && eventType !== "message.received") {
          const { handleTelnyxDlr } = await import("@/lib/sms/dlr-handler.server");
          return handleTelnyxDlr(request, raw);
        }

        // Rebuild a Request so parseInbound can read the body again.
        const req2 = new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: raw,
        });
        const inbound = await provider.parseInbound(req2);
        if (!inbound.from || !inbound.body) return new Response("Missing fields", { status: 400 });

        const admin = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data: num } = await admin
          .from("sending_numbers")
          .select("id, workspace_id, phone")
          .eq("phone", inbound.to)
          .maybeSingle();
        if (!num) return new Response("Unknown destination", { status: 404 });

        // Leads can be stored in any spelling (E.164, digits, "(312) 555-1234"),
        // while Telnyx always reports E.164 — an exact match would miss the lead
        // and the reply would never pause the cadence or reach the right bot.
        const { phoneVariants } = await import("@/lib/optout.server");
        const { data: lead } = await admin
          .from("leads")
          .select("id")
          .eq("workspace_id", num.workspace_id)
          .in("phone", phoneVariants(inbound.from))
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let campaignId: string | null = null;
        if (lead) {
          const { data: last } = await admin
            .from("messages")
            .select("campaign_id")
            .eq("workspace_id", num.workspace_id)
            .eq("lead_id", lead.id)
            .eq("direction", "outbound")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          campaignId = last?.campaign_id ?? null;
        }

        const { classifyInbound, processInbound } = await import("@/lib/inbound.server");
        const { isOptOut } = classifyInbound(inbound.body);

        const { data: inboundRow } = await admin.from("messages").insert({
          workspace_id: num.workspace_id,
          campaign_id: campaignId,
          lead_id: lead?.id ?? null,
          sending_number_id: num.id,
          direction: "inbound",
          body: inbound.body,
          is_optout: isOptOut,
          status: "received",
          provider_sid: inbound.providerSid,
        }).select("id").single();

        // Shared pipeline: STOP/HELP first, bot only after the compliance gate.
        const outcome = await processInbound({
          db: admin,
          send: (from, to, body) => provider.send(from, to, body),
          workspaceId: num.workspace_id,
          toPhone: inbound.to,
          sendingNumberId: num.id,
          fromPhone: inbound.from,
          body: inbound.body,
          leadId: lead?.id ?? null,
          campaignId,
          inboundMessageId: inboundRow?.id ?? null,
          // Mirrors the thread_key trigger: lead id when known, else the SID.
          threadKey: lead?.id ?? inbound.providerSid ?? null,
        });

        return Response.json({ ok: true, optOut: outcome.optOut, help: outcome.help, bot: outcome.bot });
      },
    },
  },
});