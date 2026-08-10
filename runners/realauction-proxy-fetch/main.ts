// ---------------------------------------------------------------------------
// realauction-proxy-fetch — internal Deno runner.
//
// Its ONLY job is to perform a single RealAuction HTTP GET through the paid
// residential proxy and hand the raw HTML back to the main pipeline. No
// parsing, no dedupe, no ingest, no database access — all of that stays in the
// app (src/lib/distress-feed.server.ts and the adapters).
//
// Why it exists: RealAuction blocks datacenter IPs (HTTP 403), and the app runs
// on Cloudflare Workers, whose fetch() has no proxy option (and whose raw
// sockets cannot set the TLS server name, so a manual CONNECT tunnel is
// rejected by the vendor's load balancer). Deno's `createHttpClient({ proxy })`
// can do it.
//
// Deploy anywhere Deno runs (Deno Deploy, Fly, a small VM):
//   deno run --allow-net --allow-env --unstable-http main.ts
// Environment:
//   PROXY_URL      residential proxy, e.g. http://user:pass_country-us@host:port
//   RELAY_SECRET   shared secret; the app sends it as x-internal-secret
// Then set REALAUCTION_RELAY_URL (this service's URL) and
// REALAUCTION_RELAY_SECRET in the app's secrets.
//
// Rules enforced here as well as in the caller:
//   * vendor domains only (*.realforeclose.com, *.realtaxdeed.com)
//   * desktop Chrome User-Agent, for this vendor only
//   * >= 5s between requests to the same host, single request at a time
//   * no retries — a blocked status is returned verbatim so the caller skips
//     that county
//   * PROXY_URL is never returned or logged; only bytes and status are logged
// ---------------------------------------------------------------------------

import { tunnelGet } from "./tunnel.ts";

const VENDOR_HOSTS = ["realforeclose.com", "realtaxdeed.com"];

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 6_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const lastHit = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialises every request this instance makes: single concurrency, always. */
let gate: Promise<unknown> = Promise.resolve();
function serialise<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn);
  gate = run.catch(() => undefined);
  return run;
}

function isVendorUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return VENDOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i += 1) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let httpClient: unknown;

function proxiedClient(proxyUrl: string): unknown {
  // IPRoyal hands out a fresh US residential IP per request, so one client is
  // reused for the whole sweep — there is no session to pin.
  httpClient ??= (
    Deno as unknown as { createHttpClient: (o: { proxy: { url: string } }) => unknown }
  ).createHttpClient({ proxy: { url: proxyUrl } });
  return httpClient;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // Internal-only: same shared-secret pattern as the app's tick-* hooks.
  const presented = (
    req.headers.get("x-internal-secret") ??
    req.headers.get("x-cron-secret") ??
    ""
  ).trim();
  const expected = (Deno.env.get("RELAY_SECRET") ?? Deno.env.get("CRON_SECRET") ?? "").trim();
  if (!expected) {
    console.error("[realauction-relay] RELAY_SECRET is not configured — refusing all calls");
    return json({ error: "Unauthorized" }, 401);
  }
  if (!presented || !secretsMatch(presented, expected)) return json({ error: "Unauthorized" }, 401);

  let payload: { url?: unknown; accept?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!isVendorUrl(url)) return json({ error: "URL is not a RealAuction vendor domain" }, 400);
  const accept =
    typeof payload.accept === "string" && payload.accept.length < 200
      ? payload.accept
      : "text/html,application/xhtml+xml";

  const proxyUrl = (Deno.env.get("PROXY_URL") ?? "").trim();
  // Fail-safe: never fall back to direct egress — it would only 403.
  if (!proxyUrl) return json({ error: "proxy_unavailable", reason: "PROXY_URL is not set" }, 503);

  const host = new URL(url).hostname;

  return await serialise(async () => {
    const wait =
      (lastHit.get(host) ?? 0) +
      MIN_DELAY_MS +
      Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)) -
      Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());

    try {
      // Primary transport: raw CONNECT + TLS. Deno Deploy ignores
      // createHttpClient({ proxy }), so the request would leave un-proxied and
      // the vendor closes the handshake. The tunnel works on Deploy and on a
      // plain Deno host alike; createHttpClient stays as a fallback.
      let status: number;
      let text: string;
      let contentType: string;
      try {
        const t = await tunnelGet(
          proxyUrl,
          url,
          { "User-Agent": CHROME_UA, Accept: accept },
          MAX_BODY_BYTES + 1,
        );
        status = t.status;
        text = t.body;
        contentType = t.contentType;
      } catch (tunnelErr) {
        const why = tunnelErr instanceof Error ? tunnelErr.message : "tunnel failed";
        console.error(`[realauction-relay] tunnel unavailable (${why.replace(/https?:\/\/\S+/g, "[redacted]")}) — trying client proxy`);
        const res = await fetch(url, {
          headers: { "User-Agent": CHROME_UA, Accept: accept },
          redirect: "follow",
          client: proxiedClient(proxyUrl),
        } as RequestInit);
        status = res.status;
        text = await res.text();
        contentType = res.headers.get("content-type") ?? "text/html";
      }
      const bytes = text.length;
      // Status and size only. Never the proxy URL or its credentials.
      console.log(`[realauction-relay] ${host} status=${status} bytes=${bytes}`);
      if (bytes > MAX_BODY_BYTES) {
        return json({ error: "response_too_large", status, bytes }, 502);
      }
      // No retries: the caller decides what to do with a non-200.
      return json({
        status,
        bytes,
        contentType,
        body: text,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "proxy fetch failed";
      // Scrub anything that could echo proxy credentials into a log or response.
      const safe = message.replace(/https?:\/\/\S+/g, "[redacted]");
      console.error(`[realauction-relay] ${host} failed: ${safe}`);
      return json({ error: "proxy_fetch_failed", reason: safe }, 502);
    }
  });
});