// Fixed-window rate limiting for the public API (Settings → API advertises
// 120 requests/minute per credential and 10 run triggers/minute per workspace).
// Counters live in Postgres so every Worker instance shares the same window.
import { apiAdminClient, type ApiCaller } from "./api-auth.server";

export const API_LIMIT_PER_MINUTE = 120;
export const RUN_TRIGGER_LIMIT_PER_MINUTE = 10;

type Verdict = { allowed: true } | { allowed: false; retryAfter: number };

async function bump(bucket: string, windowSeconds: number, limit: number): Promise<Verdict> {
  try {
    const { data, error } = await apiAdminClient().rpc("bump_api_rate", {
      _bucket: bucket,
      _window_seconds: windowSeconds,
    });
    if (error) return { allowed: true }; // never fail closed on a counter outage
    const hits = typeof data === "number" ? data : 0;
    if (hits > limit) {
      const now = Math.floor(Date.now() / 1000);
      const retryAfter = windowSeconds - (now % windowSeconds);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

function callerKey(caller: ApiCaller): string {
  return caller.keyId ? `key:${caller.keyId}` : `user:${caller.userId ?? "anon"}`;
}

/** Per-credential request budget. */
export function checkApiRate(caller: ApiCaller): Promise<Verdict> {
  return bump(`api:${callerKey(caller)}`, 60, API_LIMIT_PER_MINUTE);
}

/** Extra budget for endpoints that start real work (and spend credits). */
export function checkRunTriggerRate(workspaceId: string): Promise<Verdict> {
  return bump(`run:${workspaceId}`, 60, RUN_TRIGGER_LIMIT_PER_MINUTE);
}

export function tooManyRequests(retryAfter: number, message: string): Response {
  return new Response(JSON.stringify({ error: message, retry_after: retryAfter }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
  });
}
