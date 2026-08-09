// Event vocabulary + webhook dispatch (spec §15.2). Every app in the family
// writes the same event types so the Real Elite hub can subscribe later without
// a rewrite. Events are persisted first, then best-effort delivered to any
// registered endpoint with an HMAC signature.

import type { SupabaseClient } from "@supabase/supabase-js";

export { EVENT_TYPES } from "./events.shared";
import type { EventType } from "./events.shared";
export type { EventType };

type AnyClient = SupabaseClient<any, any, any>;

/**
 * Persist an event and fan it out to the workspace's webhook endpoints.
 * Never throws — event emission must not fail the action that produced it.
 */
export async function emitEvent(
  supabase: AnyClient,
  workspaceId: string,
  type: EventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    // Canonical hub ID travels with every payload when the workspace is linked (spec §16).
    const { data: ws } = await supabase
      .from("workspaces")
      .select("real_elite_org_id")
      .eq("id", workspaceId)
      .maybeSingle();
    const realEliteOrgId: string | null = ws?.real_elite_org_id ?? null;

    const { data: row } = await supabase
      .from("events")
      .insert({
        workspace_id: workspaceId,
        type,
        payload: { ...payload, real_elite_org_id: realEliteOrgId } as never,
      })
      .select("id, created_at")
      .maybeSingle();

    const { data: endpoints } = await supabase
      .from("webhook_endpoints")
      .select("id, url, secret, event_types, active")
      .eq("workspace_id", workspaceId)
      .eq("active", true);

    const targets = (endpoints ?? []).filter(
      (e) => !e.event_types?.length || e.event_types.includes(type),
    );
    if (!targets.length || !row) return;

    const body = JSON.stringify({
      id: row.id,
      type,
      workspace_id: workspaceId,
      real_elite_org_id: realEliteOrgId,
      created_at: row.created_at,
      payload,
    });

    let error: string | null = null;
    const { attemptDelivery } = await import("./webhook-delivery.server");
    const deliveries: Record<string, unknown>[] = [];
    await Promise.all(
      targets.map(async (e) => {
        const outcome = await attemptDelivery({
          workspaceId,
          endpointId: e.id,
          url: e.url,
          secret: e.secret,
          eventId: row.id,
          eventType: type,
          body,
          attempt: 1,
        });
        if (outcome.error) error = outcome.error;
        deliveries.push(outcome.row);
      }),
    );

    if (deliveries.length) {
      await supabase.from("webhook_deliveries").insert(deliveries as never);
    }

    await supabase
      .from("events")
      .update({ delivered_at: new Date().toISOString(), delivery_error: error })
      .eq("id", row.id);
  } catch {
    /* events are observability, never a blocker */
  }
}
