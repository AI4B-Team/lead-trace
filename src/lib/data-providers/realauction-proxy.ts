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

import { hasSocketRuntime, tunnelFetch } from "./proxy-tunnel";

type Runtime = "deno" | "bun" | "workers" | "none";

/** Which proxy mechanism this runtime supports for outbound fetches. */
export function proxyRuntime(): Runtime {
  const g = globalThis as unknown as {
    Deno?: { createHttpClient?: unknown };
    Bun?: unknown;
  };
  if (typeof g.Deno?.createHttpClient === "function") return "deno";
  if (g.Bun) return "bun";
  // Cloudflare Workers has no proxy option on fetch; we tunnel over a socket.
  if (hasSocketRuntime()) return "workers";
  return "none";
}

/**
 * Fail-safe check. If the proxy is not usable we skip the sweep entirely —
 * falling back to direct fetches would just 403 and waste the tick.
 */
export function realauctionProxyStatus(): { available: boolean; reason?: string } {
  if (!proxyUrl()) return { available: false, reason: "PROXY_URL is not set" };
  const runtime = proxyRuntime();
  if (runtime === "none") {
    return { available: false, reason: "runtime cannot route fetch through an HTTP proxy" };
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

export async function realauctionFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const status = realauctionProxyStatus();
  if (!status.available) throw new ProxyUnavailableError(status.reason ?? "unknown");
  const proxy = proxyUrl()!;
  const runtime = proxyRuntime();

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
  if (runtime === "workers") {
    const headers: Record<string, string> = {};
    const incoming = new Headers((init.headers ?? {}) as HeadersInit);
    incoming.forEach((value, key) => {
      headers[key] = value;
    });
    headers["User-Agent"] ??= REALAUCTION_USER_AGENT;
    return tunnelFetch(url, proxy, headers);
  }
  return fetch(url, { ...init, proxy } as RequestInit);
}
