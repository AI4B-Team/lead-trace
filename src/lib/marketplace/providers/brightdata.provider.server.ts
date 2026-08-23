/**
 * Collection provider — Bright Data (managed collection service, preferred).
 *
 * Access model: Bright Data's own commercial Dataset API, triggered with our
 * account credentials against a dataset an operator has reviewed and pinned.
 * We trigger a snapshot, poll its progress, and download the records. Nothing
 * here bypasses a marketplace's protections.
 *
 * Endpoint surface (documented Dataset API v3; routes verified reachable):
 *   POST /datasets/v3/trigger?dataset_id=... -> { snapshot_id }
 *   GET  /datasets/v3/progress/{snapshot_id} -> { status: running|ready|failed }
 *   GET  /datasets/v3/snapshot/{snapshot_id}?format=json -> [ ...records ]
 *
 * STATUS: implemented but UNVERIFIED end-to-end, because no Bright Data
 * credentials or reviewed dataset are configured for this project yet. Until a
 * real snapshot has been collected and normalized, this provider reports Not
 * Configured and the registry will not select it — so no source can be flipped
 * to Live on the strength of untested code.
 */
import {
  CollectionProviderError, pollDelayMs, providerHealth,
  type CollectionProvider, type CollectionRequest, type CollectionResult,
  type ProviderErrorCategory, type ProviderHealth, type ProviderJob,
} from "./contract.shared";

const BD_BASE = "https://api.brightdata.com";
const JOB_TIMEOUT_MS = 4 * 60 * 1000;
const MAX_POLLS = 40;

function token(): string | null {
  const t = process.env["BRIGHTDATA_API_TOKEN"];
  return t && t.trim() ? t.trim() : null;
}

/** Dataset per source — an operator pins the reviewed dataset id. */
function datasetFor(source: string): string | null {
  const v = process.env[`MARKETPLACE_BRIGHTDATA_DATASET_${source.toUpperCase()}`];
  return v && v.trim() ? v.trim() : null;
}

function requireToken(): string {
  const t = token();
  if (!t) {
    throw new CollectionProviderError(
      "not_configured",
      "Bright Data collection is not configured.",
      null,
      "brightdata",
    );
  }
  return t;
}

function categoryForStatus(status: number): ProviderErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404) return "bad_request";
  return "provider_error";
}

async function bdRequest(path: string, init: RequestInit & { retries?: number } = {}): Promise<any> {
  const { retries = 2, ...rest } = init;
  const auth = requireToken();
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${BD_BASE}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${auth}`,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
    });
    if (res.ok) {
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        // Snapshot downloads can arrive as newline-delimited JSON.
        return text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }
    }
    const category = categoryForStatus(res.status);
    const retryAfter = Number(res.headers.get("retry-after")) || null;
    const transient = category === "rate_limited" || category === "provider_error";
    if (!transient || attempt >= retries) {
      const body = await res.text().catch(() => "");
      throw new CollectionProviderError(
        category,
        `Bright Data request failed (${res.status}). ${body.slice(0, 200)}`.trim(),
        retryAfter,
        "brightdata",
      );
    }
    await new Promise((r) => setTimeout(r, retryAfter ? retryAfter * 1000 : pollDelayMs(attempt)));
    attempt += 1;
  }
}

export const brightDataProvider: CollectionProvider = {
  key: "brightdata",
  accessModel:
    "Bright Data managed collection service, triggered through its Dataset API with our own account credentials.",
  get supportedSources() {
    return ["facebook", "craigslist", "offerup", "kijiji", "gumtree"].filter((s) =>
      Boolean(datasetFor(s)),
    );
  },

  // Both a token AND a reviewed dataset are required; a token alone collects nothing.
  isConfigured: () => Boolean(token()),

  async executeSearch(request: CollectionRequest): Promise<ProviderJob> {
    const dataset = datasetFor(request.source);
    if (!dataset) {
      throw new CollectionProviderError(
        "not_configured",
        `No reviewed Bright Data dataset is configured for ${request.source}.`,
        null,
        "brightdata",
      );
    }
    if (!request.targets.length) {
      throw new CollectionProviderError("bad_request", "No collection target was provided.", null, "brightdata");
    }
    const query = new URLSearchParams({ dataset_id: dataset, include_errors: "true" });
    const body = await bdRequest(`/datasets/v3/trigger?${query.toString()}`, {
      method: "POST",
      body: JSON.stringify(
        request.targets.map((url) => ({ url, ...(request.parameters ?? {}) })),
      ),
    });
    const snapshot = body?.snapshot_id ?? body?.snapshotId;
    if (!snapshot) {
      throw new CollectionProviderError("provider_error", "Bright Data did not return a snapshot id.", null, "brightdata");
    }
    return {
      provider: "brightdata",
      id: String(snapshot),
      state: "queued",
      resultRef: String(snapshot),
      startedAt: Date.now(),
      requests: 1,
      error: null,
    };
  },

  async checkStatus(job) {
    const body = await bdRequest(`/datasets/v3/progress/${encodeURIComponent(job.id)}`);
    const status = String(body?.status ?? "").toLowerCase();
    const state: ProviderJob["state"] =
      status === "ready"
        ? "succeeded"
        : status === "failed"
          ? "failed"
          : status === "running" || status === "collecting" || status === "building"
            ? "running"
            : "queued";
    return {
      ...job,
      state,
      requests: job.requests + 1,
      error:
        state === "failed"
          ? { category: "provider_error", message: "Collection snapshot failed." }
          : null,
    };
  },

  async retrieveResults(job) {
    const records = await bdRequest(
      `/datasets/v3/snapshot/${encodeURIComponent(job.resultRef ?? job.id)}?format=json`,
    );
    const list = Array.isArray(records) ? records : [];
    return {
      provider: "brightdata",
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
    let job = await brightDataProvider.executeSearch(request);
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      if (job.state === "succeeded") break;
      if (job.state === "failed") {
        throw new CollectionProviderError(
          "provider_error",
          job.error?.message ?? "Collection snapshot failed.",
          null,
          "brightdata",
        );
      }
      if (Date.now() - job.startedAt > JOB_TIMEOUT_MS) {
        throw new CollectionProviderError(
          "timeout",
          "Collection snapshot exceeded the check window.",
          null,
          "brightdata",
        );
      }
      await new Promise((r) => setTimeout(r, pollDelayMs(attempt)));
      job = await brightDataProvider.checkStatus(job);
    }
    if (job.state !== "succeeded") {
      throw new CollectionProviderError("timeout", "Collection snapshot did not finish in time.", null, "brightdata");
    }
    const result = await brightDataProvider.retrieveResults(job);
    const records = result.records.slice(0, request.maxRecords);
    return {
      ...result,
      records,
      truncated: result.records.length > records.length,
    } satisfies CollectionResult;
  },

  async healthCheck(): Promise<ProviderHealth> {
    if (!token()) {
      return providerHealth("brightdata", "not_configured", "No Bright Data credentials are configured.");
    }
    try {
      await bdRequest("/datasets/v3/progress/health-probe", { retries: 0 });
      return providerHealth("brightdata", "healthy", "Bright Data is responding and credentials are valid.");
    } catch (err) {
      const e = err instanceof CollectionProviderError ? err : null;
      if (e?.category === "auth") {
        return providerHealth("brightdata", "unavailable", "Bright Data rejected the configured credentials.");
      }
      // A bad_request on a fake snapshot id means the API answered us, so the
      // credentials work even though the probe target does not exist.
      if (e?.category === "bad_request") {
        return providerHealth("brightdata", "healthy", "Bright Data is responding and credentials are valid.");
      }
      if (e?.category === "rate_limited") {
        return providerHealth("brightdata", "degraded", "Bright Data is rate limiting requests right now.");
      }
      return providerHealth("brightdata", "unavailable", "Bright Data could not be reached.");
    }
  },

  getMetadata() {
    const meta: Record<string, string | number | boolean> = {
      credentialsConfigured: Boolean(token()),
      verifiedEndToEnd: false,
      jobTimeoutSeconds: JOB_TIMEOUT_MS / 1000,
    };
    for (const s of ["facebook", "craigslist", "offerup", "kijiji", "gumtree"]) {
      const ds = datasetFor(s);
      if (ds) meta[`${s}Dataset`] = ds;
    }
    return meta;
  },
};
