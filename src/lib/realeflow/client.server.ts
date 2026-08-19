// Realeflow Partner API — server-only HTTP client.
// The .server.ts suffix keeps this file (and the API key) out of the
// client bundle. Never import this from client components.
//
// Env vars required (set in .env locally / hosting secrets in prod):
//   REALEFLOW_BASE_URL    e.g. https://api.your-white-label.com  (no trailing slash)
//   REALEFLOW_API_KEY     partner API key (GUID)
//   REALEFLOW_ACCOUNT_ID  partner account id (external or numeric)

import process from "node:process";
import type {
  AutocompleteResult,
  CompsRequest,
  CompsResponse,
  DetailsInclude,
  DetailsResponse,
  SearchRequest,
  SearchResponse,
} from "./types";

const API_PREFIX = "/api/2.0/leadpipes";

export class RealeflowError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RealeflowError";
  }
}

function getConfig() {
  // Read per-request (not module scope) — required on edge runtimes.
  const baseUrl = process.env.REALEFLOW_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.REALEFLOW_API_KEY;
  const accountId = process.env.REALEFLOW_ACCOUNT_ID;
  if (!baseUrl || !apiKey || !accountId) {
    throw new RealeflowError(
      500,
      "Realeflow API is not configured. Set REALEFLOW_BASE_URL, REALEFLOW_API_KEY and REALEFLOW_ACCOUNT_ID.",
    );
  }
  return { baseUrl, apiKey, accountId };
}

async function rfFetch<T>(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const { baseUrl, apiKey, accountId } = getConfig();
  let url = `${baseUrl}${API_PREFIX}${path}`;
  if (opts.query) url += `?${new URLSearchParams(opts.query).toString()}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-RF-Partner-Api-Key": apiKey,
      "X-RF-Partner-Account-Id": accountId,
      "Content-Type": "application/json",
      Accept: "application/json",
      // Cloudflare in front of the API serves a "Just a moment..." interstitial
      // (HTTP 403) to non-browser user-agents, so send a browser UA.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    // Auth-stage failures return plain text; endpoint errors return JSON.
    let message = text.slice(0, 500);
    if (/Just a moment|challenges\.cloudflare\.com|cf-browser-verification/i.test(text)) {
      // Never surface the raw HTML interstitial to callers/UI.
      throw new RealeflowError(
        res.status,
        "Realeflow request was blocked by the provider's bot protection. Please retry shortly.",
      );
    }
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      /* keep plain text */
    }
    throw new RealeflowError(res.status, `Realeflow ${res.status}: ${message}`);
  }

  return JSON.parse(text) as T;
}

// ── Endpoint wrappers ─────────────────────────────────────────────────────

/** GET /autocomplete — free-text address/place suggestions. Empty array = no match. */
export function rfAutocomplete(q: string): Promise<AutocompleteResult[]> {
  return rfFetch<AutocompleteResult[]>("GET", "/autocomplete", { query: { q } });
}

/** GET /details/{hash} — full property record with optional includes.
 * NOTE: unlike /comps and /search, this endpoint wraps the record in a
 * `{ data: {...} }` envelope (confirmed against live API 2026-07-29). */
export async function rfDetails(
  identifier: string,
  withIncludes: DetailsInclude[] = ["history", "parcel", "preforeclosures", "liens"],
): Promise<DetailsResponse> {
  const res = await rfFetch<{ data: DetailsResponse } | DetailsResponse>(
    "GET",
    `/details/${encodeURIComponent(identifier)}`,
    { query: { with: withIncludes.join(",") } },
  );
  if (res && typeof res === "object" && "data" in res && !("property_value" in res)) {
    return (res as { data: DetailsResponse }).data;
  }
  return res as DetailsResponse;
}

/** POST /comps/{hash} — comparable properties for a subject identified by hash. */
export function rfCompsByHash(identifier: string, body: CompsRequest = {}): Promise<CompsResponse> {
  return rfFetch<CompsResponse>("POST", `/comps/${encodeURIComponent(identifier)}`, { body });
}

/** POST /comps — comparable properties for a subject described by address. */
export function rfCompsByAddress(body: CompsRequest): Promise<CompsResponse> {
  return rfFetch<CompsResponse>("POST", "/comps", { body });
}

/** POST /search — multi-filter property search. Requires a geographic anchor. */
export function rfSearch(body: SearchRequest): Promise<SearchResponse> {
  return rfFetch<SearchResponse>("POST", "/search", { body });
}
