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
const resolvedBuilds = new Map<string, string>();

async function pinnedBuild(token: string, actor: string): Promise<string | null> {
  const override = process.env.APIFY_GMAPS_ACTOR_BUILD;
  if (override && actor === (process.env.APIFY_GMAPS_ACTOR ?? "compass~crawler-google-places")) {
    return override;
  }
  const cached = resolvedBuilds.get(actor);
  if (cached) return cached;
  try {
    const res = await apifyFetch(`${APIFY_BASE}/acts/${encodeURIComponent(actor)}`, {
      headers: authHeaders(token),
    });
    const body = (await res.json()) as {
      data?: { taggedBuilds?: Record<string, { buildNumber?: string }> };
    };
    const build = body.data?.taggedBuilds?.latest?.buildNumber ?? null;
    if (!build) return null;
    resolvedBuilds.set(actor, build);
    console.info(
      `[apify] pinned ${actor} to build ${build}. Set APIFY_GMAPS_ACTOR_BUILD=${build} to freeze it.`,
    );
    return build;
  } catch {
    return null; // never block a run on version resolution
  }
}

// ── Source registry ────────────────────────────────────────────────────────
// Each business source is one Apify actor plus the two functions that make it
// interchangeable: how a run's input is built, and how a dataset item maps onto
// our RawLead shape. Adding a source is a new entry here — nothing else changes.

export type ApifySourceId = "gmaps" | "yelp" | "linkedin";

type PlannedRun = { label: string; input: Record<string, unknown> };

type SourceConfig = {
  id: ApifySourceId;
  actorEnv: string;
  defaultActor: string;
  /** One entry per Apify run. Most sources fan searches out across runs. */
  plan(params: BusinessScrapeParams, cap: number): PlannedRun[];
  map(item: Record<string, unknown>, params: BusinessScrapeParams, actor: string): RawLead;
};

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s ? s : null;
};

const searchAreas = (params: BusinessScrapeParams): string[] => {
  const counties = params.counties.filter(Boolean);
  return counties.length ? counties.map((c) => `${c} ${params.state}`.trim()) : [params.state];
};

const searchNiches = (params: BusinessScrapeParams): string[] =>
  params.niches.filter(Boolean).length ? params.niches.filter(Boolean) : ["local business"];

const SOURCES: Record<ApifySourceId, SourceConfig> = {
  // ── Google Maps ────────────────────────────────────────────────────────
  gmaps: {
    id: "gmaps",
    actorEnv: "APIFY_GMAPS_ACTOR",
    defaultActor: "compass~crawler-google-places",
    plan(params, cap) {
      const searchStrings: string[] = [];
      for (const niche of searchNiches(params)) {
        for (const area of searchAreas(params)) searchStrings.push(`${niche} in ${area}`.trim());
      }
      // This actor takes the whole fan-out in one run.
      return [
        {
          label: `${searchStrings.length} Google Maps searches`,
          input: {
            searchStringsArray: searchStrings,
            maxCrawledPlacesPerSearch: cap,
            language: "en",
            exportPlaceUrls: false,
          },
        },
      ];
    },
    map(it, params, actor) {
      return {
        business_name: str(it.title) ?? str(it.name),
        phone: str(it.phone) ?? str(it.phoneUnformatted),
        email: null,
        address: str(it.address),
        city: str(it.city),
        state: str(it.state) ?? params.state,
        zip: str(it.postalCode),
        source_meta: {
          provider: "apify",
          source: "google_maps",
          actor,
          website: str(it.website),
          category: str(it.categoryName),
          rating: it.totalScore ?? null,
          reviews: it.reviewsCount ?? null,
        },
      } satisfies RawLead;
    },
  },

  // ── Yelp ───────────────────────────────────────────────────────────────
  yelp: {
    id: "yelp",
    actorEnv: "APIFY_YELP_ACTOR",
    defaultActor: "api-ninja~yelp-ultimate-scraper",
    plan(params, cap) {
      const runs: PlannedRun[] = [];
      for (const niche of searchNiches(params)) {
        for (const area of searchAreas(params)) {
          runs.push({
            label: `Yelp — ${niche} in ${area}`,
            input: {
              query: niche,
              location: area,
              // The actor refuses anything under 40 results per search.
              numberOfResults: Math.max(40, cap),
              details: "advanced",
              includeAds: false,
            },
          });
        }
      }
      return runs;
    },
    map(it, params, actor) {
      const cats = Array.isArray(it.categories) ? (it.categories as Array<Record<string, unknown>>) : [];
      return {
        business_name: str(it.name),
        phone: str(it.dialable_phone) ?? str(it.localized_phone) ?? str(it.phone),
        email: null,
        address: str(it.address1),
        city: str(it.city),
        state: str(it.state) ?? params.state,
        zip: str(it.zip),
        source_meta: {
          provider: "apify",
          source: "yelp",
          actor,
          website: str(it.display_url),
          category: cats.length ? str(cats[0]?.name) : null,
          rating: it.avg_rating ?? null,
          reviews: it.review_count ?? null,
          yelp_url: str(it.share_url),
          yelp_id: str(it.id),
          is_chain: it.is_chain_business ?? null,
        },
      } satisfies RawLead;
    },
  },

  // ── LinkedIn companies ─────────────────────────────────────────────────
  // The actor's structured location filter expects LinkedIn geo IDs, so we fold
  // the area into the free-text query instead — that's what actually matches.
  linkedin: {
    id: "linkedin",
    actorEnv: "APIFY_LINKEDIN_ACTOR",
    defaultActor: "harvestapi~linkedin-company-search",
    plan(params, cap) {
      const runs: PlannedRun[] = [];
      for (const niche of searchNiches(params)) {
        for (const area of searchAreas(params)) {
          runs.push({
            label: `LinkedIn — ${niche} in ${area}`,
            input: {
              searchQuery: `${niche} ${area}`.trim(),
              maxItems: cap,
              scraperMode: "full",
            },
          });
        }
      }
      return runs;
    },
    map(it, params, actor) {
      const locs = Array.isArray(it.locations) ? (it.locations as Array<Record<string, unknown>>) : [];
      const hq = locs.find((l) => l.headquarter === true) ?? locs[0] ?? {};
      return {
        business_name: str(it.name),
        // LinkedIn never exposes a dialable number; skip trace fills this in.
        phone: null,
        email: null,
        address: str(hq.line1),
        city: str(hq.city),
        state: str(hq.geographicArea) ?? params.state,
        zip: str(hq.postalCode),
        source_meta: {
          provider: "apify",
          source: "linkedin",
          actor,
          platform: "linkedin",
          handle: str(it.universalName),
          website: str(it.website),
          linkedin_url: str(it.linkedinUrl),
          followers: it.followerCount ?? null,
          employee_count: it.employeeCount ?? null,
          company_type: str(it.companyType),
          tagline: str(it.tagline),
          founded_year: (it.foundedOn as Record<string, unknown> | undefined)?.year ?? null,
        },
      } satisfies RawLead;
    },
  },
};

/** Template ids in the catalog map onto the source that actually serves them. */
export function apifySourceForTemplate(templateId?: string | null): ApifySourceId {
  const id = (templateId ?? "").toLowerCase();
  if (id === "yelp") return "yelp";
  if (id === "linkedin") return "linkedin";
  return "gmaps";
}

// ── Run driver ─────────────────────────────────────────────────────────────

/** Start one actor run, poll it to completion, and page its whole dataset. */
async function runActor(
  token: string,
  actor: string,
  input: Record<string, unknown>,
  label: string,
  onProgress?: Progress,
  alreadyCollected = 0,
): Promise<Array<Record<string, unknown>>> {
  // a) START ---------------------------------------------------------------
  const build = await pinnedBuild(token, actor);
  const startRes = await apifyFetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/runs${build ? `?build=${encodeURIComponent(build)}` : ""}`,
    {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify(input),
    },
  );
  const start = (await startRes.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  const runId = start.data?.id;
  const datasetId = start.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error("Apify did not return a run id.");

  // b) POLL ----------------------------------------------------------------
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

    const statusRes = await apifyFetch(`${APIFY_BASE}/actor-runs/${runId}`, {
      headers: authHeaders(token),
    });
    const run = (await statusRes.json()) as {
      data?: { status?: string; statusMessage?: string; stats?: { itemCount?: number } };
    };
    const status = run.data?.status ?? "RUNNING";
    const itemCount = run.data?.stats?.itemCount;
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(
        `Apify run ${status.toLowerCase()} (${label}): ${run.data?.statusMessage ?? "no detail"}`,
      );
    }
    const total = alreadyCollected + (itemCount ?? 0);
    await onProgress?.(
      typeof itemCount === "number"
        ? `${label} — ${total.toLocaleString()} records so far.`
        : `${label} — in progress…`,
      total,
    );
  }

  // c) FETCH (paged) -------------------------------------------------------
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
  return items;
}

async function apifyScrape(
  token: string,
  source: SourceConfig,
  actor: string,
  params: BusinessScrapeParams,
  onProgress?: Progress,
): Promise<RawLead[]> {
  const cap = params.max_results && params.max_results > 0 ? params.max_results : 500;
  const runs = source.plan(params, cap);
  const leads: RawLead[] = [];
  for (const run of runs) {
    const items = await runActor(token, actor, run.input, run.label, onProgress, leads.length);
    for (const it of items) leads.push(source.map(it, params, actor));
    await onProgress?.(`${run.label} — ${leads.length.toLocaleString()} records collected.`, leads.length);
  }
  return leads;
}

/**
 * `sourceId` picks which business source runs. Callers that don't care (health
 * canaries, legacy call sites) get Google Maps, the original behaviour.
 */
export function getBusinessScraper(sourceId: ApifySourceId = "gmaps"): BusinessScraper {
  const source = SOURCES[sourceId] ?? SOURCES.gmaps;
  return {
    key: `apify.${source.id}`,
    isConfigured() {
      return Boolean(process.env.APIFY_TOKEN);
    },
    async scrape(params) {
      const token = process.env.APIFY_TOKEN;
      if (!token) {
        throw new Error("Apify is not connected. Add credentials in Settings → Integrations.");
      }
      const actor = process.env[source.actorEnv] ?? source.defaultActor;
      // No mock fallback: real failures must surface, never fabricate leads.
      return apifyScrape(token, source, actor, params, params.onProgress);
    },
  };
}
