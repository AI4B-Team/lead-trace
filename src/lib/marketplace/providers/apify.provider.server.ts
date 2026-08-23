/**
 * Collection provider — Apify (managed collection service).
 *
 * Access model: Apify's own commercial collection product, run through its
 * public REST API with our account credentials. We submit a job to a published
 * actor, poll it, and read the resulting dataset. Nothing here bypasses a
 * marketplace's protections; if a marketplace cannot be collected within the
 * provider's terms, the source stays `planned` and we collect nothing.
 *
 * Verified against the live Apify REST API surface:
 *   POST /v2/acts/{actor}/runs        -> { data: { id, status, defaultDatasetId } }
 *   GET  /v2/actor-runs/{runId}       -> { data: { status, defaultDatasetId } }
 *   GET  /v2/datasets/{id}/items      -> [ ...records ]
 *   POST /v2/actor-runs/{runId}/abort -> { data: { status } }
 *
 * Credentials are read from process.env INSIDE calls, never at module scope.
 */
import {
  CollectionProviderError, pollDelayMs, providerHealth,
  type CollectionProvider, type CollectionRequest, type CollectionResult,
  type ProviderErrorCategory, type ProviderHealth, type ProviderJob,
} from "./contract.shared";

const APIFY_BASE = "https://api.apify.com/v2";
const JOB_TIMEOUT_MS = 4 * 60 * 1000; // a monitoring check must never outlive its cadence
const MAX_POLLS = 40;

/**
 * Actor per source. Set the env var to pin the exact actor an operator has
 * reviewed; without it the source is simply Not Configured — we never guess an
 * actor and start spending on it.
 */
function actorFor(source: string): string | null {
  const key = `MARKETPLACE_APIFY_ACTOR_${source.toUpperCase()}`;
  const value = process.env[key];
  return value && value.trim() ? value.trim() : null;
}

/**
 * Build pinning. A third-party actor update can silently rename fields, so a
 * reviewed build number can be frozen per source.
 */
function buildFor(source: string): string | null {
  const value = process.env[`MARKETPLACE_APIFY_BUILD_${source.toUpperCase()}`];
  return value && value.trim() ? value.trim() : null;
}

function token(): string | null {
  const t = process.env["APIFY_TOKEN"];
  return t && t.trim() ? t.trim() : null;
}

function requireToken(): string {
  const t = token();
  if (!t) {
    throw new CollectionProviderError(
      "not_configured",
      "Apify collection is not configured.",
      null,
      "apify",
    );
  }
  return t;
}

/** Map an HTTP status onto the provider-neutral error vocabulary. */
function categoryForStatus(status: number): ProviderErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404) return "bad_request";
  return "provider_error";
}

async function apifyRequest(
  path: string,
  init: RequestInit & { retries?: number } = {},
): Promise<any> {
  const { retries = 2, ...rest } = init;
  const auth = requireToken();
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${APIFY_BASE}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${auth}`,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
    });
    if (res.ok) {
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
    const category = categoryForStatus(res.status);
    const retryAfter = Number(res.headers.get("retry-after")) || null;
    const transient = category === "rate_limited" || category === "provider_error";
    if (!transient || attempt >= retries) {
      const body = await res.text().catch(() => "");
      throw new CollectionProviderError(
        category,
        `Apify request failed (${res.status}). ${body.slice(0, 200)}`.trim(),
        retryAfter,
        "apify",
      );
    }
    await new Promise((r) => setTimeout(r, retryAfter ? retryAfter * 1000 : pollDelayMs(attempt)));
    attempt += 1;
  }
}

function jobStateFor(status: string): ProviderJob["state"] {
  switch (status) {
    case "SUCCEEDED":
      return "succeeded";
    case "READY":
      return "queued";
    case "RUNNING":
    case "ABORTING":
      return "running";
    case "TIMED-OUT":
      return "timed_out";
    default:
      return "failed";
  }
}

/** Actor input. Only knobs the actor's published input schema defines. */
function actorInput(request: CollectionRequest): Record<string, unknown> {
  return {
    startUrls: request.targets.map((url) => ({ url })),
    resultsLimit: Math.max(1, Math.min(request.maxRecords, 500)),
    includeListingDetails: Boolean(request.wantDetail),
    ...(request.parameters ?? {}),
  };
}

export const apifyProvider: CollectionProvider = {
  key: "apify",
  accessModel:
    "Apify managed collection service, run against a published actor with our own account credentials.",
  // A source is served only when an operator has pinned an actor for it.
  get supportedSources() {
    return ["facebook", "craigslist", "offerup", "kijiji", "gumtree"].filter((s) =>
      Boolean(actorFor(s)),
    );
  },

  isConfigured: () => Boolean(token()),

  async executeSearch(request) {
    if (!request.targets.length) {
      throw new CollectionProviderError("bad_request", "No collection target was provided.", null, "apify");
    }
    const actor = actorFor(request.source);
    if (!actor) {
      throw new CollectionProviderError(
        "not_configured",
        `No reviewed collection job is configured for ${request.source}.`,
        null,
        "apify",
      );
    }
    const build = buildFor(request.source);
    const query = new URLSearchParams({ timeout: "240", memory: "2048" });
    if (build) query.set("build", build);

    const body = await apifyRequest(
      `/acts/${encodeURIComponent(actor)}/runs?${query.toString()}`,
      { method: "POST", body: JSON.stringify(actorInput(request)) },
    );
    const data = body?.data ?? {};
    if (!data.id) {
      throw new CollectionProviderError("provider_error", "Apify did not return a job id.", null, "apify");
    }
    return {
      provider: "apify",
      id: String(data.id),
      state: jobStateFor(String(data.status ?? "READY")),
      resultRef: data.defaultDatasetId ? String(data.defaultDatasetId) : null,
      startedAt: Date.now(),
      requests: 1,
      error: null,
    };
  },

  async checkStatus(job) {
    const body = await apifyRequest(`/actor-runs/${encodeURIComponent(job.id)}`);
    const data = body?.data ?? {};
    const state = jobStateFor(String(data.status ?? ""));
    return {
      ...job,
      state,
      resultRef: data.defaultDatasetId ? String(data.defaultDatasetId) : job.resultRef ?? null,
      requests: job.requests + 1,
      error:
        state === "failed" || state === "timed_out"
          ? {
              category: state === "timed_out" ? "timeout" : "provider_error",
              message: `Collection job ended as ${String(data.status ?? "FAILED")}.`,
            }
          : null,
    };
  },

  async retrieveResults(job) {
    if (!job.resultRef) {
      throw new CollectionProviderError("provider_error", "Collection job produced no result set.", null, "apify");
    }
    const records = await apifyRequest(
      `/datasets/${encodeURIComponent(job.resultRef)}/items?clean=true&format=json`,
    );
    const list = Array.isArray(records) ? records : [];
    return {
      provider: "apify",
      jobId: job.id,
      records: list,
      usage: { requests: job.requests + 1, records: list.length, durationMs: Date.now() - job.startedAt },
      rateLimited: false,
      retryAfterSeconds: null,
      truncated: false,
      note: null,
    };
  },

  async collect(request) {
    let job = await apifyProvider.executeSearch(request);
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      if (job.state === "succeeded") break;
      if (job.state === "failed" || job.state === "timed_out") {
        throw new CollectionProviderError(
          job.error?.category ?? "provider_error",
          job.error?.message ?? "Collection job failed.",
          null,
          "apify",
        );
      }
      if (Date.now() - job.startedAt > JOB_TIMEOUT_MS) {
        await apifyProvider.cancel?.(job).catch(() => {});
        throw new CollectionProviderError(
          "timeout",
          "Collection job exceeded the check window and was stopped.",
          null,
          "apify",
        );
      }
      await new Promise((r) => setTimeout(r, pollDelayMs(attempt)));
      job = await apifyProvider.checkStatus(job);
    }
    if (job.state !== "succeeded") {
      await apifyProvider.cancel?.(job).catch(() => {});
      throw new CollectionProviderError("timeout", "Collection job did not finish in time.", null, "apify");
    }
    const result = await apifyProvider.retrieveResults(job);
    return {
      ...result,
      truncated: result.records.length >= request.maxRecords,
    } satisfies CollectionResult;
  },

  async cancel(job) {
    await apifyRequest(`/actor-runs/${encodeURIComponent(job.id)}/abort`, {
      method: "POST",
      retries: 0,
    });
  },

  async healthCheck(): Promise<ProviderHealth> {
    if (!token()) {
      return providerHealth("apify", "not_configured", "No Apify credentials are configured.");
    }
    try {
      // Cheap, read-only probe that works with scoped tokens.
      await apifyRequest("/actor-runs?limit=1", { retries: 0 });
      return providerHealth("apify", "healthy", "Apify is responding and credentials are valid.");
    } catch (err) {
      const e = err instanceof CollectionProviderError ? err : null;
      if (e?.category === "auth") {
        return providerHealth("apify", "unavailable", "Apify rejected the configured credentials.");
      }
      if (e?.category === "rate_limited") {
        return providerHealth("apify", "degraded", "Apify is rate limiting requests right now.");
      }
      return providerHealth("apify", "unavailable", "Apify could not be reached.");
    }
  },

  getMetadata() {
    const sources = ["facebook", "craigslist", "offerup", "kijiji", "gumtree"];
    const meta: Record<string, string | number | boolean> = {
      credentialsConfigured: Boolean(token()),
      jobTimeoutSeconds: JOB_TIMEOUT_MS / 1000,
    };
    for (const s of sources) {
      const actor = actorFor(s);
      if (actor) {
        meta[`${s}Actor`] = actor;
        meta[`${s}Build`] = buildFor(s) ?? "unpinned";
      }
    }
    return meta;
  },
};
