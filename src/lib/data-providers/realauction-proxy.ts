// ---------------------------------------------------------------------------
// RealAuction egress policy (proxy + browser User-Agent).
//
// Why this file exists: RealAuction (RealForeclose / RealTaxDeed) blocks
// datacenter IP ranges outright — all 24 county adapters returned HTTP 403 for
// weeks. Verified 2026-08-10: a US residential proxy IP *and* a normal desktop
// Chrome User-Agent are BOTH required; the residential IP alone still 403s when
// the honest LeadTraceBot UA is sent.
//
// Scope is deliberately narrow. Only *.realforeclose.com and *.realtaxdeed.com
// are routed through the paid proxy; ArcGIS, Socrata and RealeFlow keep direct
// egress so we never burn residential bandwidth on sources that don't need it.
// ---------------------------------------------------------------------------

/** Desktop Chrome UA — vendor rejects non-browser agents (verified 2026-08-10). */
export const REALAUCTION_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** Per-sweep bandwidth ceiling. The plan is 2 GB/month; a normal night is <2 MB. */
export const REALAUCTION_SWEEP_BYTE_CAP = 10 * 1024 * 1024;

const VENDOR_HOSTS = ["realforeclose.com", "realtaxdeed.com"];

/** Does this URL belong to the vendor that requires the proxy? */
export function isRealauctionUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return VENDOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export class ProxyUnavailableError extends Error {
  readonly code = "proxy_unavailable";
  constructor(reason: string) {
    super(`proxy unavailable: ${reason}`);
    this.name = "ProxyUnavailableError";
  }
}

export class BandwidthCapError extends Error {
  readonly code = "bandwidth_cap";
  constructor(used: number, cap: number) {
    super(`RealAuction sweep aborted: bandwidth cap reached (${used} of ${cap} bytes)`);
    this.name = "BandwidthCapError";
  }
}

export function proxyUrl(): string | null {
  const value = process.env["PROXY_URL"];
  return value && value.trim() ? value.trim() : null;
}

type Runtime = "deno" | "bun" | "relay" | "gateway" | "none";

// ---------------------------------------------------------------------------
// Relay transports. Cloudflare Workers cannot proxy a fetch at all, so when the
// pipeline runs there the proxied hop is delegated to something that can:
//
//   1. "relay"   — an internal Deno runner we operate. It holds PROXY_URL and
//                  does exactly one vendor GET per call. Authenticated with the
//                  same shared internal-hook secret as the tick-* endpoints.
//   2. "gateway" — Lovable's hosted website-fetch service. No proxy secret is
//                  involved; used as a fallback when no runner is configured.
//
// Neither transport ever receives or echoes PROXY_URL from this side.
// ---------------------------------------------------------------------------

function relayConfig(): { url: string; secret: string } | null {
  const url = (process.env["REALAUCTION_RELAY_URL"] ?? "").trim();
  const secret = (
    process.env["REALAUCTION_RELAY_SECRET"] ??
    process.env["CRON_SECRET"] ??
    ""
  ).trim();
  return url && secret ? { url, secret } : null;
}

function gatewayConfig(): { url: string; token: string } | null {
  const url = (process.env["AGW_URL"] ?? "").trim();
  const token = (process.env["AGW_TOKEN"] ?? process.env["LOVABLE_API_KEY"] ?? "").trim();
  return url && token ? { url, token } : null;
}

/** Which proxy mechanism this runtime supports for outbound fetches. */
export function proxyRuntime(): Runtime {
  const g = globalThis as unknown as {
    Deno?: { createHttpClient?: unknown };
    Bun?: unknown;
  };
  if (typeof g.Deno?.createHttpClient === "function") return "deno";
  if (g.Bun) return "bun";
  // Cloudflare Workers cannot proxy: fetch() has no proxy option, and a manual
  // CONNECT tunnel cannot set the TLS server name, so the vendor's load
  // balancer rejects the handshake (measured 2026-08-10). Plain HTTP through
  // the proxy is answered with a 301 to HTTPS. So delegate instead.
  if (relayConfig()) return "relay";
  if (gatewayConfig()) return "gateway";
  return "none";
}

/**
 * Fail-safe check. If the proxy is not usable we skip the sweep entirely —
 * falling back to direct fetches would just 403 and waste the tick.
 */
export function realauctionProxyStatus(): { available: boolean; reason?: string } {
  const runtime = proxyRuntime();
  // The relay holds PROXY_URL on its own side; this side only needs the runner.
  if (runtime === "relay" || runtime === "gateway") return { available: true };
  if (!proxyUrl()) return { available: false, reason: "PROXY_URL is not set" };
  if (runtime === "none") {
    return {
      available: false,
      reason:
        "this runtime cannot route fetch through an HTTP proxy (set REALAUCTION_RELAY_URL, or run on Deno/Bun)",
    };
  }
  return { available: true };
}

// ---------------------------------------------------------------------------
// Bandwidth accounting for one nightly sweep.
// ---------------------------------------------------------------------------

type Budget = { cap: number; used: number; lastStatus: number | null };
let budget: Budget | null = null;

export function startRealauctionBudget(cap: number = REALAUCTION_SWEEP_BYTE_CAP): void {
  budget = { cap, used: 0, lastStatus: null };
}

export function endRealauctionBudget(): number {
  const used = budget?.used ?? 0;
  budget = null;
  return used;
}

export function bytesUsed(): number {
  return budget?.used ?? 0;
}

export function lastVendorStatus(): number | null {
  return budget?.lastStatus ?? null;
}

/** Throws before a request is made if the sweep has already spent its budget. */
export function assertBudgetAvailable(): void {
  if (budget && budget.used >= budget.cap) throw new BandwidthCapError(budget.used, budget.cap);
}

/** Record one vendor response. Throws once the cap is crossed. */
export function recordVendorFetch(bytes: number, status: number | null): void {
  if (!budget) return;
  budget.used += Math.max(0, bytes);
  budget.lastStatus = status;
  if (budget.used >= budget.cap) throw new BandwidthCapError(budget.used, budget.cap);
}

// ---------------------------------------------------------------------------
// The proxied fetch itself.
// ---------------------------------------------------------------------------

let denoClient: unknown;

function accepted(init: RequestInit): string {
  const headers = (init.headers ?? {}) as Record<string, string>;
  return headers["Accept"] ?? headers["accept"] ?? "text/html,application/xhtml+xml";
}

/** One vendor GET performed by our internal Deno runner. */
async function viaRelay(
  cfg: { url: string; secret: string },
  url: string,
  init: RequestInit,
): Promise<Response> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": cfg.secret,
    },
    body: JSON.stringify({ url, accept: accepted(init) }),
  });
  const payload = (await res.json().catch(() => null)) as {
    status?: number;
    body?: string;
    contentType?: string;
    error?: string;
    reason?: string;
  } | null;
  if (!res.ok || !payload || typeof payload.status !== "number") {
    const reason = payload?.reason ?? payload?.error ?? `relay HTTP ${res.status}`;
    if (payload?.error === "proxy_unavailable") throw new ProxyUnavailableError(reason);
    throw new Error(`RealAuction relay failed: ${reason}`);
  }
  return new Response(payload.body ?? "", {
    status: payload.status,
    headers: { "content-type": payload.contentType ?? "text/html" },
  });
}

/** Fallback: Lovable's hosted website-fetch service renders the vendor page. */
async function viaGateway(
  cfg: { url: string; token: string },
  url: string,
): Promise<Response> {
  const res = await fetch(`${cfg.url}/f/website-fetch/v1/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["html"] }),
  });
  const payload = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { html?: string };
  } | null;
  const html = payload?.data?.html;
  if (!res.ok || !payload?.success || !html) {
    // Report as a vendor-side failure so the caller skips this county; the
    // gateway does not tell us the upstream status.
    return new Response("", { status: res.status === 200 ? 502 : res.status });
  }
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

export async function realauctionFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const status = realauctionProxyStatus();
  if (!status.available) throw new ProxyUnavailableError(status.reason ?? "unknown");
  const runtime = proxyRuntime();

  if (runtime === "relay") return viaRelay(relayConfig()!, url, init);
  if (runtime === "gateway") return viaGateway(gatewayConfig()!, url);

  const proxy = proxyUrl()!;
  // IPRoyal "Randomize IP" hands out a fresh US residential IP per request, so
  // one client can be reused — there is no session to pin.
  if (runtime === "deno") {
    const deno = (
      globalThis as unknown as {
        Deno: { createHttpClient: (o: { proxy: { url: string } }) => unknown };
      }
    ).Deno;
    denoClient ??= deno.createHttpClient({ proxy: { url: proxy } });
    return fetch(url, { ...init, client: denoClient } as RequestInit);
  }
  return fetch(url, { ...init, proxy } as RequestInit);
}
