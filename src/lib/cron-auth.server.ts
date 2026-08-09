// Server-only authentication for /api/public/hooks/tick-* cron endpoints.
//
// These endpoints move real money (SMS spend, scrape + skip-trace credits) and
// send email to government agencies, so they must NEVER be gated by the
// Supabase publishable/anon key — that key ships inside the browser bundle.
//
// Two accepted credentials, both server-side only:
//   1. CRON_SECRET env var (set by an operator, for external schedulers)
//   2. public.cron_credentials.secret (random, generated in the database and
//      read by pg_cron when it builds the x-cron-secret header)
// Comparison is constant-time.

import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function presentedSecret(request: Request): string {
  return (
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer /i, "") ??
    ""
  ).trim();
}

async function dbSecret(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("cron_credentials")
      .select("secret")
      .eq("key", "default")
      .maybeSingle();
    return (data as { secret: string } | null)?.secret ?? null;
  } catch {
    return null;
  }
}

/** Returns null when the caller is authorised, otherwise a 401 Response. */
export async function requireCronAuth(request: Request): Promise<Response | null> {
  const presented = presentedSecret(request);
  if (!presented) return unauthorized();

  const candidates = [process.env["CRON_SECRET"] ?? "", (await dbSecret()) ?? ""].filter(Boolean);
  if (candidates.length === 0) {
    // Fail closed: no server-side secret configured means nobody gets in.
    console.error("[cron] no CRON_SECRET or cron_credentials row configured");
    return unauthorized();
  }
  const ok = candidates.some((c) => safeEqual(presented, c));
  return ok ? null : unauthorized();
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Overlap guard. Claims a tick only when the last successful claim for this key
 * is older than `minSeconds`; concurrent or replayed invocations get `false`
 * even when they present a valid secret.
 */
export async function claimTick(key: string, minSeconds = 30): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("claim_cron_tick", {
    _key: key,
    _min_interval: `${minSeconds} seconds`,
  });
  if (error) {
    console.error("[cron] claim_cron_tick failed:", error.message);
    return false;
  }
  return data === true;
}

/**
 * Standard wrapper for every /api/public/hooks/tick-* endpoint: authenticates
 * the caller, guards against overlap, times the run, and records the outcome
 * so the platform admin can see whether the schedule is healthy.
 */
export async function runTick(
  request: Request,
  key: string,
  minSeconds: number,
  fn: () => Promise<unknown>,
): Promise<Response> {
  const denied = await requireCronAuth(request);
  if (denied) return denied;

  if (!(await claimTick(key, minSeconds))) {
    return Response.json({ ok: true, skipped: "tick_in_progress" }, { status: 202 });
  }

  const { recordTickResult } = await import("@/lib/cron-health.server");
  const startedAt = Date.now();
  try {
    const result = await fn();
    const body = (result ?? {}) as Record<string, unknown>;
    const failed = body["ok"] === false;
    await recordTickResult(
      key,
      failed ? "error" : "ok",
      failed ? String(body["error"] ?? "Tick Failed") : summarise(body),
      Date.now() - startedAt,
    );
    return Response.json(body, { status: failed ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : `${key} failed`;
    console.error(`${key} failed:`, message);
    await recordTickResult(key, "error", message, Date.now() - startedAt);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Compact one-line summary of a tick result payload, for the admin health list. */
function summarise(body: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === "ok") continue;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
      parts.push(`${k}=${v}`);
    } else if (Array.isArray(v)) {
      parts.push(`${k}=${v.length}`);
    }
    if (parts.length >= 5) break;
  }
  return parts.join(" · ") || "completed";
}
