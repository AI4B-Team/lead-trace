// ---------------------------------------------------------------------------
// Shared crawl etiquette for every county source we touch.
//
// Hard rule: we never solve a CAPTCHA programmatically. No solving services,
// no image recognition, no bypass attempts. Portals that gate behind a CAPTCHA
// are authenticated ONCE by a human team member (see portal_sessions) and the
// captured session is reused until it expires, at which point the portal is
// flagged for manual re-auth.
// ---------------------------------------------------------------------------

import {
  assertBudgetAvailable,
  isRealauctionUrl,
  realauctionFetch,
  REALAUCTION_USER_AGENT,
  recordVendorFetch,
} from "./realauction-proxy";

export const BOT_CONTACT_URL = "https://leadtrace.app/compliance";
export const BOT_USER_AGENT = `LeadTraceBot/1.0 (+${BOT_CONTACT_URL})`;

/**
 * One request every 3–4 seconds per host, jittered. County government systems
 * get the slower of our two budgets; this floor is deliberate, not tunable
 * per-caller.
 */
const MIN_DELAY_MS = 3_000;
const MAX_DELAY_MS = 4_000;
/** RealAuction is a paid residential path onto county boxes: go slower still. */
const VENDOR_MIN_DELAY_MS = 5_000;
const VENDOR_MAX_DELAY_MS = 6_000;
const lastHit = new Map<string, number>();

export function politeDelayMs(vendor = false): number {
  const min = vendor ? VENDOR_MIN_DELAY_MS : MIN_DELAY_MS;
  const max = vendor ? VENDOR_MAX_DELAY_MS : MAX_DELAY_MS;
  return min + Math.floor(Math.random() * (max - min));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(host: string, vendor = false) {
  const now = Date.now();
  const wait = (lastHit.get(host) ?? 0) + politeDelayMs(vendor) - now;
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

/** robots.txt check, cached per host. Fails open only on network error. */
const robotsCache = new Map<string, string[]>();

async function disallowedPaths(origin: string): Promise<string[]> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  let rules: string[] = [];
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const vendor = isRealauctionUrl(robotsUrl);
    const res = vendor
      ? await realauctionFetch(robotsUrl, { headers: { "User-Agent": REALAUCTION_USER_AGENT } })
      : await fetch(robotsUrl, { headers: { "User-Agent": BOT_USER_AGENT } });
    if (res.ok) {
      const text = await res.text();
      let applies = false;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.split("#")[0]!.trim();
        const [k, ...rest] = line.split(":");
        const key = (k ?? "").trim().toLowerCase();
        const val = rest.join(":").trim();
        if (key === "user-agent") applies = val === "*" || val.toLowerCase().includes("leadtrace");
        else if (key === "disallow" && applies && val) rules.push(val);
      }
    }
  } catch {
    rules = [];
  }
  robotsCache.set(origin, rules);
  return rules;
}

export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  const rules = await disallowedPaths(u.origin);
  return !rules.some((p) => u.pathname.startsWith(p));
}

/**
 * Rate-limited, honestly identified fetch with exponential backoff on
 * 429/503. Throws on anything else non-OK so callers can mark the source
 * failed instead of silently returning nothing.
 */
export async function politeFetch(
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const host = new URL(url).host;
  // Vendor requests are proxied and carry a browser UA; everything else keeps
  // direct egress and the honest bot UA.
  const vendor = isRealauctionUrl(url);
  if (vendor) assertBudgetAvailable();
  if (attempt === 0 && !(await robotsAllows(url))) {
    throw new Error(`robots.txt Disallows ${url}`);
  }
  await throttle(host, vendor);
  const requestInit: RequestInit = {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": vendor ? REALAUCTION_USER_AGENT : BOT_USER_AGENT,
      ...(init.headers ?? {}),
    },
  };
  const res = vendor ? await realauctionFetch(url, requestInit) : await fetch(url, requestInit);
  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2_000 * Math.pow(2, attempt);
    await sleep(backoff);
    return politeFetch(url, init, attempt + 1);
  }
  if (!res.ok) {
    // No retries on a block: log the status and let the caller skip the county.
    if (vendor) recordVendorFetch(0, res.status);
    throw new Error(`Source Returned HTTP ${res.status}`);
  }
  return res;
}

export async function politeJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await politeFetch(url, init);
  return (await res.json()) as T;
}

export async function politeHtml(
  url: string,
  init: RequestInit = {},
): Promise<{ html: string; status: number; bytes: number }> {
  const res = await politeFetch(url, {
    ...init,
    headers: { Accept: "text/html,application/xhtml+xml", ...(init.headers ?? {}) },
  });
  const html = await res.text();
  const bytes = html.length;
  if (isRealauctionUrl(url)) recordVendorFetch(bytes, res.status);
  return { html, status: res.status, bytes };
}

// ---------------------------------------------------------------------------
// Live auction windows.
//
// Florida clerk auctions run weekday mornings. We never crawl while bidding is
// live: it adds load exactly when the county needs the box responsive, and the
// page is mid-state anyway.
// ---------------------------------------------------------------------------

/** Hours (in the source's local time) we refuse to crawl, Mon–Fri. */
export const AUCTION_BLACKOUT = { startHour: 8, endHour: 14 } as const;

export function auctionWindowBlock(
  now: Date = new Date(),
  timeZone = "America/New_York",
): { blocked: boolean; reason?: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  if (isWeekday && hour >= AUCTION_BLACKOUT.startHour && hour < AUCTION_BLACKOUT.endHour) {
    return {
      blocked: true,
      reason: `Live auction window (${weekday} ${hour}:00 ${timeZone}) — crawl deferred`,
    };
  }
  return { blocked: false };
}
