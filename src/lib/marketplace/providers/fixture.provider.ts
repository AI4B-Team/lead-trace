/**
 * Collection provider — recorded fixtures.
 *
 * Not a data source: it replays records captured from a real provider run so
 * adapters, normalization, filtering and scheduling can be tested without
 * spending money or touching a marketplace. It is only selectable when
 * MARKETPLACE_COLLECTION_PROVIDER is explicitly set to "fixture", so it can
 * never stand in for real collection in production.
 */
import {
  CollectionProviderError, providerHealth,
  type CollectionProvider, type CollectionRequest, type CollectionResult, type ProviderJob,
} from "./contract.shared";

type FixtureSet = Record<string, unknown[]>;

const FIXTURES: FixtureSet = {};

/** Register (or replace) the records a source replays. Tests and PoC only. */
export function setFixtureRecords(source: string, records: unknown[]): void {
  FIXTURES[source] = records;
}

export function clearFixtureRecords(): void {
  for (const key of Object.keys(FIXTURES)) delete FIXTURES[key];
}

function job(request: CollectionRequest): ProviderJob {
  return {
    provider: "fixture",
    id: `fixture-${request.searchId}-${request.source}`,
    state: "succeeded",
    resultRef: request.source,
    startedAt: Date.now(),
    requests: 1,
    error: null,
  };
}

export const fixtureProvider: CollectionProvider = {
  key: "fixture",
  accessModel: "Recorded fixtures replayed locally. No marketplace is contacted.",
  get supportedSources() {
    return Object.keys(FIXTURES);
  },
  isConfigured: () => true,

  executeSearch: async (request) => job(request),
  checkStatus: async (j) => ({ ...j, state: "succeeded" }),

  retrieveResults: async (j) => {
    const records = FIXTURES[j.resultRef ?? ""] ?? [];
    return {
      provider: "fixture",
      jobId: j.id,
      records,
      usage: { requests: 1, records: records.length, durationMs: 1 },
      rateLimited: false,
      retryAfterSeconds: null,
      truncated: false,
      note: "Recorded fixtures.",
    };
  },

  async collect(request) {
    const records = FIXTURES[request.source];
    if (!records) {
      throw new CollectionProviderError(
        "not_configured",
        `No fixtures are recorded for ${request.source}.`,
        null,
        "fixture",
      );
    }
    const capped = records.slice(0, request.maxRecords);
    return {
      provider: "fixture",
      jobId: job(request).id,
      records: capped,
      usage: { requests: 1, records: capped.length, durationMs: 1 },
      rateLimited: false,
      retryAfterSeconds: null,
      truncated: records.length > capped.length,
      note: "Recorded fixtures.",
    } satisfies CollectionResult;
  },

  healthCheck: async () =>
    providerHealth("fixture", "healthy", "Recorded fixtures are available for replay."),

  getMetadata: () => ({ sources: Object.keys(FIXTURES).join(",") || "none" }),
};
