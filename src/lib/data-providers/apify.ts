import type { BusinessScraper, BusinessScrapeParams, RawLead } from "./index";

// Apify business-source adapters: Google Maps, Yelp, and LinkedIn companies.
// Reads APIFY_TOKEN (and optional per-source actor overrides) at call time from
// process.env — never at module scope. Real failures propagate to the
// pipeline's failure path. There is no mock path: an unconfigured or failing
// scraper surfaces as an error.

const APIFY_BASE = "https://api.apify.com/v2";
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ApifyAuthError extends Error {}

function authHeaders(token: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

/**
 * Cheap credential probe used by the integrations UI. Uses /actor-runs rather
 * than /users/me so scoped (limited-permission) tokens still verify.
 */
export async function verifyApifyToken(): Promise<{ ok: boolean; message: string }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { ok: false, message: "No Apify token is configured." };
  const res = await fetch(`${APIFY_BASE}/actor-runs?limit=1`, { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, message: `Apify rejected the token (${res.status}). ${body.slice(0, 200)}` };
  }
  return { ok: true, message: "Apify is connected." };
}

/** Retries 429/5xx up to 3 times; 4xx auth errors throw immediately. */
async function apifyFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let delay = 1000;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    const transient = res.status === 429 || res.status >= 500;
    if (res.status === 401 || res.status === 403) {
      throw new ApifyAuthError(
        `Apify rejected the credentials (${res.status}). Reconnect Apify in Settings → Integrations.`,
      );
    }
    if (!transient || attempt === 3) {
      throw new Error(`Apify request failed: ${res.status} ${body.slice(0, 200)}`);
    }
    await sleep(delay);
    delay *= 2;
  }
  throw new Error("Apify request failed after retries.");
}

type Progress = (message: string, count?: number) => Promise<void> | void;

/**
 * Actor version pinning. A third-party actor update between two canary runs can
 * silently change field names or drop phone numbers, so every run targets one
 * exact build number rather than "latest".
 *
 * APIFY_GMAPS_ACTOR_BUILD freezes it explicitly. With no override we resolve the
 * actor's current build number once and reuse that exact number for the process
 * lifetime, logging it so an operator can freeze the value that was verified.
 */
let resolvedBuild: { actor: string; build: string } | null = null;

async function pinnedBuild(token: string, actor: string): Promise<string | null> {
  const override = process.env.APIFY_GMAPS_ACTOR_BUILD;
  if (override) return override;
  if (resolvedBuild?.actor === actor) return resolvedBuild.build;
  try {
    const res = await apifyFetch(`${APIFY_BASE}/acts/${encodeURIComponent(actor)}`, {
      headers: authHeaders(token),
    });
    const body = (await res.json()) as {
      data?: { taggedBuilds?: Record<string, { buildNumber?: string }> };
    };
    const build = body.data?.taggedBuilds?.latest?.buildNumber ?? null;
    if (!build) return null;
    resolvedBuild = { actor, build };
    console.info(
      `[apify] pinned ${actor} to build ${build}. Set APIFY_GMAPS_ACTOR_BUILD=${build} to freeze it.`,
    );
    return build;
  } catch {
    return null; // never block a run on version resolution
  }
}

async function apifyScrape(
  token: string,
  actor: string,
  params: BusinessScrapeParams & { max_results?: number | null },
  onProgress?: Progress,
): Promise<RawLead[]> {
  const searchStrings: string[] = [];
  const niches = params.niches.length ? params.niches : ["local business"];
  const counties = params.counties.length ? params.counties : [""];
  for (const niche of niches) {
    for (const county of counties) {
      searchStrings.push(`${niche} in ${county} ${params.state}`.trim());
    }
  }
  const maxPerSearch = params.max_results && params.max_results > 0 ? params.max_results : 500;

  // a) START -----------------------------------------------------------------
  const build = await pinnedBuild(token, actor);
  const startRes = await apifyFetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/runs${build ? `?build=${encodeURIComponent(build)}` : ""}`,
    {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({
        searchStringsArray: searchStrings,
        maxCrawledPlacesPerSearch: maxPerSearch,
        language: "en",
        exportPlaceUrls: false,
      }),
    },
  );
  const start = (await startRes.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  const runId = start.data?.id;
  const datasetId = start.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error("Apify did not return a run id.");

  // b) POLL ------------------------------------------------------------------
  const startedAt = Date.now();
  let interval = 2000;
  for (;;) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      await apifyFetch(`${APIFY_BASE}/actor-runs/${runId}/abort`, {
        method: "POST",
        headers: authHeaders(token),
      }).catch(() => undefined);
      throw new Error("Apify run exceeded the 20 minute limit and was aborted.");
    }
    await sleep(interval);
    interval = Math.min(Math.round(interval * 1.5), 15000);

    const statusRes = await apifyFetch(
      `${APIFY_BASE}/actor-runs/${runId}`,
      { headers: authHeaders(token) },
    );
    const run = (await statusRes.json()) as {
      data?: { status?: string; statusMessage?: string; stats?: { itemCount?: number } };
    };
    const status = run.data?.status ?? "RUNNING";
    const itemCount = run.data?.stats?.itemCount;
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${status.toLowerCase()}: ${run.data?.statusMessage ?? "no detail"}`);
    }
    await onProgress?.(
      typeof itemCount === "number"
        ? `Scraping in progress — ${itemCount.toLocaleString()} records so far.`
        : "Scraping in progress…",
      itemCount,
    );
  }

  // c) FETCH (paged) ---------------------------------------------------------
  const limit = 1000;
  const items: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += limit) {
    const res = await apifyFetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&format=json&offset=${offset}&limit=${limit}`,
      { headers: authHeaders(token) },
    );
    const page = (await res.json()) as Array<Record<string, unknown>>;
    items.push(...page);
    if (page.length < limit) break;
  }

  return items.map((it) => {
    const title = (it.title as string | undefined) ?? (it.name as string | undefined) ?? null;
    const phone = (it.phone as string | undefined) ?? (it.phoneUnformatted as string | undefined) ?? null;
    const website = (it.website as string | undefined) ?? null;
    const address = (it.address as string | undefined) ?? null;
    const city = (it.city as string | undefined) ?? null;
    const state = (it.state as string | undefined) ?? params.state;
    const zip = (it.postalCode as string | undefined) ?? null;
    const categoryName = (it.categoryName as string | undefined) ?? null;
    return {
      business_name: title,
      phone,
      email: null,
      address,
      city,
      state,
      zip,
      source_meta: {
        provider: "apify",
        actor,
        website,
        category: categoryName,
        rating: it.totalScore ?? null,
        reviews: it.reviewsCount ?? null,
      },
    } satisfies RawLead;
  });
}

export function getBusinessScraper(): BusinessScraper {
  return {
    key: "apify.gmaps",
    isConfigured() {
      return Boolean(process.env.APIFY_TOKEN);
    },
    async scrape(params) {
      const token = process.env.APIFY_TOKEN;
      if (!token) {
        throw new Error("Apify is not connected. Add credentials in Settings → Integrations.");
      }
      const actor = process.env.APIFY_GMAPS_ACTOR ?? "compass~crawler-google-places";
      // No mock fallback: real failures must surface, never fabricate leads.
      return apifyScrape(token, actor, params, params.onProgress);
    },
  };
}
