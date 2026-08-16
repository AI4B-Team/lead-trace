import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getProvider } from "@/lib/sms";

/**
 * Telnyx call-control webhook. Records inbound calls, voicemails and their
 * transcripts as VOICE items on the lead's conversation thread so the inbox
 * shows callbacks alongside texts (never styled as an SMS).
 */
export const Route = createFileRoute("/api/public/hooks/telnyx-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const provider = getProvider();
        if (!(await provider.verifyWebhook(request, raw))) {
          return new Response("Invalid signature", { status: 403 });
        }

        let payload: Record<string, unknown> = {};
        let eventType = "";
        try {
          const parsed = JSON.parse(raw) as { data?: { event_type?: string; payload?: Record<string, unknown> } };
          payload = parsed.data?.payload ?? {};
          eventType = parsed.data?.event_type ?? "";
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const from = String(payload["from"] ?? "");
        const to = String(payload["to"] ?? "");
        if (!from || !to) return new Response("Missing fields", { status: 400 });

        // A hangup fires at the end of EVERY call, including ones we answered —
        // logging those as "missed" put a bogus missed-call item on the thread
        // right after the answered one. Only unanswered causes are missed calls.
        const hangupCause = String(payload["hangup_cause"] ?? "").toLowerCase();
        const MISSED_CAUSES = [
          "no_answer",
          "timeout",
          "busy",
          "originator_cancel",
          "call_rejected",
          "unallocated_number",
        ];
        const isHangup = eventType.includes("hangup");
        if (isHangup && hangupCause && !MISSED_CAUSES.includes(hangupCause)) {
          return new Response("ok");
        }

        const callEvent =
          eventType.includes("recording") || eventType.includes("transcription")
            ? "voicemail"
            : isHangup
              ? "missed"
              : eventType.includes("answered")
                ? "answered"
                : "forwarded";

        const admin = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data: num } = await admin
          .from("sending_numbers")
          .select("id, workspace_id, recording_enabled")
          .eq("phone", to)
          .maybeSingle();
        if (!num) return new Response("Unknown destination", { status: 404 });

        // Leads may be stored in any phone spelling; Telnyx always sends E.164.
        const { phoneVariants } = await import("@/lib/optout.server");
        const { data: lead } = await admin
          .from("leads")
          .select("id")
          .eq("workspace_id", num.workspace_id)
          .in("phone", phoneVariants(from))
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const recording = (num as { recording_enabled?: boolean }).recording_enabled
          ? (payload["recording_urls"] as { mp3?: string } | undefined)?.mp3 ??
            (typeof payload["recording_url"] === "string" ? (payload["recording_url"] as string) : null)
          : null;
        const transcript =
          (payload["transcription_text"] as string | undefined) ??
          ((payload["transcription"] as { text?: string } | undefined)?.text ?? null);
        const seconds = Number(payload["recording_duration_millis"] ?? 0)
          ? Math.round(Number(payload["recording_duration_millis"]) / 1000)
          : (Number(payload["duration_secs"]) || null);

        const { error } = await admin.from("messages").insert({
          workspace_id: num.workspace_id,
          lead_id: lead?.id ?? null,
          sending_number_id: num.id,
          direction: "inbound",
          channel: "voice",
          call_event: callEvent,
          body: null,
          transcript,
          recording_url: recording,
          recording_seconds: seconds,
          status: "received",
          provider_sid: typeof payload["call_session_id"] === "string" ? (payload["call_session_id"] as string) : null,
        } as never);
        if (error) return new Response(error.message, { status: 500 });

        return new Response("ok");
      },
    },
  },
});