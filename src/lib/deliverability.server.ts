/**
 * Per-number deliverability tracking and auto-pause.
 *
 * Delivery receipts are the only honest signal that a DID is still landing
 * messages. We aggregate them per number AND per carrier, because a number can
 * be fine on one carrier and silently filtered on another — a blended rate
 * hides exactly the failure we care about.
 */

export {
  numberHealth,
  perNumberDailyCap,
  warmupCap,
  MIN_SAMPLE_FOR_PAUSE,
  type NumberHealth,
} from "@/lib/deliverability.shared";

import { numberHealth, MIN_SAMPLE_FOR_PAUSE } from "@/lib/deliverability.shared";

/**
 * Record one delivery receipt, then pause the number when its delivery rate
 * falls under its configured floor on a large enough sample.
 */
export async function recordDeliveryOutcome(args: {
  providerSid: string;
  delivered: boolean;
  carrier?: string | null;
}): Promise<{ ok: boolean; paused: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: message } = await supabaseAdmin
    .from("messages")
    .select("id, workspace_id, sending_number_id, carrier")
    .eq("provider_sid", args.providerSid)
    .limit(1);
  const msg = ((message ?? []) as unknown[])[0] as {
    workspace_id: string;
    sending_number_id: string | null;
    carrier: string | null;
  } | undefined;
  if (!msg?.sending_number_id) return { ok: false, paused: false };

  const carrier = args.carrier ?? msg.carrier ?? "unknown";
  await supabaseAdmin.rpc("record_dlr_outcome", {
    _workspace_id: msg.workspace_id,
    _sending_number_id: msg.sending_number_id,
    _carrier: carrier,
    _delivered: args.delivered,
  });

  const { data: number } = await supabaseAdmin
    .from("sending_numbers")
    .select("id, phone, status, delivered_count, failed_count, min_delivery_rate, auto_paused_at")
    .eq("id", msg.sending_number_id)
    .maybeSingle();
  const num = number as {
    id: string;
    phone: string;
    status: string | null;
    delivered_count: number | null;
    failed_count: number | null;
    min_delivery_rate: number | null;
    auto_paused_at: string | null;
  } | null;
  if (!num) return { ok: true, paused: false };

  const health = numberHealth(num);
  const shouldPause =
    health.status === "poor" && health.sample >= MIN_SAMPLE_FOR_PAUSE && num.status === "active";

  if (!shouldPause) return { ok: true, paused: false };

  const reason = `Delivery rate ${(100 * (health.deliveryRate ?? 0)).toFixed(0)}% over ${health.sample} receipts is below the ${(100 * (num.min_delivery_rate ?? 0.75)).toFixed(0)}% floor.`;
  await supabaseAdmin
    .from("sending_numbers")
    .update({ status: "cooling", auto_paused_at: new Date().toISOString(), auto_pause_reason: reason })
    .eq("id", num.id);

  await supabaseAdmin.from("notifications").insert({
    workspace_id: msg.workspace_id,
    kind: "number_paused",
    title: "Sending Number Paused",
    body: `We paused ${num.phone} automatically. ${reason}`,
  } as never);

  console.error(`[deliverability] paused ${num.phone}: ${reason}`);
  return { ok: true, paused: true };
}
