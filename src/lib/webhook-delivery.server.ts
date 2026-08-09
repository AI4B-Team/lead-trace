// Outbound webhook delivery with signed bodies and exponential backoff retries.
// A delivery row is written for every attempt; failed attempts carry the signed
// request body plus a next_retry_at so the retry sweeper can replay them.

import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, any, any>;

/** Minutes to wait before attempt N+1 (1st retry after 1m, then 5m, 15m, 60m). */
export const BACKOFF_MINUTES = [1, 5, 15, 60];
/** Total attempts allowed, including the first. */
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

export function nextRetryAt(attempt: number): string | null {
  const wait = BACKOFF_MINUTES[attempt - 1];
  if (wait == null) return null;
  return new Date(Date.now() + wait * 60_000).toISOString();
}

export async function signBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type DeliveryAttempt = {
  workspaceId: string;
  endpointId: string;
  url: string;
  secret: string;
  eventId: string;
  eventType: string;
  body: string;
  attempt: number;
};

export type DeliveryOutcome = {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  row: Record<string, unknown>;
};

/** POST the event once and build the delivery row (caller persists it). */
export async function attemptDelivery(a: DeliveryAttempt): Promise<DeliveryOutcome> {
  const startedAt = Date.now();
  let statusCode: number | null = null;
  let ok = false;
  let error: string | null = null;
  try {
    const signature = await signBody(a.secret, a.body);
    const res = await fetch(a.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-leadtrace-event": a.eventType,
        "x-leadtrace-attempt": String(a.attempt),
        // Family standard §3/§6: canonical HMAC header name across every app.
        "x-webhook-signature": signature,
        "x-leadtrace-signature": signature,
      },
      body: a.body,
    });
    statusCode = res.status;
    ok = res.ok;
    if (!ok) error = `${a.url} responded ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : "Delivery failed";
  }

  const retryAt = ok ? null : nextRetryAt(a.attempt);
  return {
    ok,
    statusCode,
    error,
    row: {
      workspace_id: a.workspaceId,
      endpoint_id: a.endpointId,
      event_id: a.eventId,
      event_type: a.eventType,
      url: a.url,
      status_code: statusCode,
      ok,
      duration_ms: Date.now() - startedAt,
      error,
      attempt: a.attempt,
      next_retry_at: retryAt,
      request_body: ok ? null : a.body,
      gave_up: !ok && retryAt === null,
    },
  };
}

/**
 * Replay every failed delivery whose backoff window has elapsed. Each replay
 * writes a new delivery row (attempt + 1) and clears the retry flag on the old
 * one so a row is only ever picked up once.
 */
export async function retryPendingWebhooks(limit = 50) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = supabaseAdmin as unknown as AnyClient;

  const { data: due, error } = await supabase
    .from("webhook_deliveries")
    .select("id, workspace_id, endpoint_id, event_id, event_type, attempt, request_body")
    .eq("ok", false)
    .eq("gave_up", false)
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let retried = 0;
  let recovered = 0;
  let exhausted = 0;

  for (const d of due ?? []) {
    // Claim it first so a concurrent tick can't double-send.
    await supabase.from("webhook_deliveries").update({ next_retry_at: null }).eq("id", d.id);
    if (!d.request_body) continue;

    const { data: endpoint } = await supabase
      .from("webhook_endpoints")
      .select("id, url, secret, active")
      .eq("id", d.endpoint_id)
      .maybeSingle();
    if (!endpoint || endpoint.active === false) {
      await supabase.from("webhook_deliveries").update({ gave_up: true }).eq("id", d.id);
      continue;
    }

    const attempt = (d.attempt ?? 1) + 1;
    const outcome = await attemptDelivery({
      workspaceId: d.workspace_id,
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      eventId: d.event_id,
      eventType: d.event_type,
      body: d.request_body,
      attempt,
    });
    await supabase.from("webhook_deliveries").insert(outcome.row as never);
    retried += 1;
    if (outcome.ok) {
      recovered += 1;
      await supabase
        .from("events")
        .update({ delivered_at: new Date().toISOString(), delivery_error: null })
        .eq("id", d.event_id);
    } else if (outcome.row.gave_up) {
      exhausted += 1;
    }
  }

  return { due: due?.length ?? 0, retried, recovered, exhausted };
}