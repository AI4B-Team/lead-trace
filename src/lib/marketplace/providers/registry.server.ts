/**
 * Collection provider registry.
 *
 * The ONLY place that knows which provider performs a retrieval. Source
 * adapters call `collectFor(source, request)`; they never import a provider
 * module, so LeadTrace cannot develop a dependency on Bright Data, Apify or a
 * future first-party collector.
 *
 * Selection order:
 *   1. MARKETPLACE_COLLECTION_PROVIDER, when set (operator override).
 *   2. Bright Data — preferred provider — when configured for that source.
 *   3. Apify — secondary — when configured for that source.
 * "Configured for that source" means credentials AND an operator-pinned
 * dataset/job for it. A provider with credentials but no reviewed job for the
 * source is skipped rather than guessed at.
 */
import { apifyProvider } from "./apify.provider.server";
import { brightDataProvider } from "./brightdata.provider.server";
import { fixtureProvider } from "./fixture.provider";
import {
  CollectionProviderError,
  type CollectionProvider, type CollectionProviderKey, type CollectionRequest,
  type CollectionResult, type ProviderHealth,
} from "./contract.shared";

/** Preference order. Fixture is never reached unless explicitly selected. */
const PROVIDERS: CollectionProvider[] = [brightDataProvider, apifyProvider];

function override(): CollectionProviderKey | null {
  const raw = (process.env["MARKETPLACE_COLLECTION_PROVIDER"] ?? "").trim().toLowerCase();
  if (!raw) return null;
  const known: CollectionProviderKey[] = ["brightdata", "apify", "first_party", "fixture"];
  return known.includes(raw as CollectionProviderKey) ? (raw as CollectionProviderKey) : null;
}

export function getProvider(key: CollectionProviderKey): CollectionProvider | null {
  if (key === "fixture") return fixtureProvider;
  return PROVIDERS.find((p) => p.key === key) ?? null;
}

/** The provider that would run a retrieval for this source, or null. */
export function providerForSource(source: string): CollectionProvider | null {
  const forced = override();
  if (forced) {
    const provider = getProvider(forced);
    if (!provider) return null;
    return provider.isConfigured() && provider.supportedSources.includes(source) ? provider : null;
  }
  return (
    PROVIDERS.find((p) => p.isConfigured() && p.supportedSources.includes(source)) ?? null
  );
}

export function isSourceCollectable(source: string): boolean {
  return Boolean(providerForSource(source));
}

/**
 * Run one retrieval for one source. Errors always arrive as
 * `CollectionProviderError` so the scheduler can branch on the category rather
 * than on provider-specific text.
 */
export async function collectFor(source: string, request: CollectionRequest): Promise<CollectionResult> {
  const provider = providerForSource(source);
  if (!provider) {
    throw new CollectionProviderError(
      "not_configured",
      `No collection provider is configured for ${source}.`,
      null,
      null,
    );
  }
  try {
    return await provider.collect(request);
  } catch (err) {
    if (err instanceof CollectionProviderError) throw err;
    throw new CollectionProviderError(
      "provider_error",
      err instanceof Error ? err.message : String(err),
      null,
      provider.key,
    );
  }
}

/** Operator view: every provider's health, in preference order. */
export async function providerHealthReport(): Promise<ProviderHealth[]> {
  const forced = override();
  const list = forced ? [getProvider(forced)].filter(Boolean) as CollectionProvider[] : PROVIDERS;
  return Promise.all(list.map((p) => p.healthCheck()));
}

/** Operator view: config detail per provider. Never contains secrets. */
export function providerMetadataReport(): Record<string, Record<string, string | number | boolean>> {
  const out: Record<string, Record<string, string | number | boolean>> = {};
  for (const p of [...PROVIDERS, fixtureProvider]) {
    out[p.key] = {
      accessModel: p.accessModel,
      configured: p.isConfigured(),
      sources: p.supportedSources.join(",") || "none",
      ...(p.getMetadata?.() ?? {}),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Test hooks
 * ------------------------------------------------------------------ */

let testProvider: CollectionProvider | null = null;

/** TESTS ONLY: force a provider without touching environment variables. */
export function __setProviderForTests(provider: CollectionProvider | null): void {
  testProvider = provider;
  if (provider) {
    const existing = PROVIDERS.findIndex((p) => p.key === provider.key);
    if (existing >= 0) PROVIDERS.splice(existing, 1);
    PROVIDERS.unshift(provider);
  } else {
    for (let i = PROVIDERS.length - 1; i >= 0; i--) {
      if (PROVIDERS[i] !== brightDataProvider && PROVIDERS[i] !== apifyProvider) PROVIDERS.splice(i, 1);
    }
  }
}

export function __currentTestProvider(): CollectionProvider | null {
  return testProvider;
}
