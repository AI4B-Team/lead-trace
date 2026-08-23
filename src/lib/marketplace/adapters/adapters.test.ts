/**
 * Adapter foundation tests. Everything here runs against fixtures — no live
 * marketplace request is made, and none should ever be added to this file.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAdapterListing, canonicalListingUrl, capabilityLabels, hasCapability,
  listingIdentity, parsePrice, parseTimestamp, sanitizeImages, sourceHealth,
  validateAgainstProfile, type SourceProfile,
} from "./contract.shared";
import {
  __resetAdaptersForTests, __setAdapterForTests, clampIntervalForSources,
  collectFromAdapter, checkSourceHealth, sourceMetadataFor, toSourceListing,
  validateSearchForSource,
} from "./registry.server";
import { createDirtyFixtureAdapter, createFixtureAdapter } from "./fixtures/fixture-adapter";
import { getCollector, collectableSources, hasAnyCollector } from "../collectors.server";

afterEach(() => __resetAdaptersForTests());

const SEARCH = {
  id: "s-1",
  category: "vehicles",
  criteria: {
    targets: ["Toyota Camry"],
    keywords: [],
    exclusions: [],
    priceMin: null,
    priceMax: 9000,
    attributes: { mileage_max: 120000 },
  },
  location: "Ocala, FL",
  radiusMiles: 50,
};

describe("shipping registry", () => {
  it("registers no marketplace adapters, so no source is faked", () => {
    expect(hasAnyCollector()).toBe(false);
    expect(collectableSources(["facebook", "craigslist", "offerup"])).toEqual([]);
    expect(getCollector("facebook")).toBeNull();
  });

  it("reports Configuration Required for an unwired source", async () => {
    const health = await checkSourceHealth("facebook");
    expect(health.key).toBe("config_required");
    expect(health.detail).not.toMatch(/http|error|stack/i);
  });
});

describe("normalization", () => {
  it("normalizes a feed payload into the common shape", async () => {
    __setAdapterForTests(createFixtureAdapter());
    const out = await collectFromAdapter("craigslist", SEARCH);
    const camry = out.normalized[0]!;

    expect(camry.title).toBe("2018 Toyota Camry SE");
    expect(camry.price).toBe(6500);
    expect(camry.currency).toBe("USD");
    expect(camry.location).toBe("Ocala, FL");
    expect(camry.latitude).toBeCloseTo(29.1872);
    expect(camry.longitude).toBeCloseTo(-82.1401);
    expect(camry.sellerName).toBe("Marcus R.");
    // Non-scalar seller values are dropped, scalars kept.
    expect(camry.sellerMetadata).toMatchObject({ joined_year: 2019, verified: true });
    expect(camry.sellerMetadata).not.toHaveProperty("internal_score");
    // Category attributes stay in their own bag, never top-level columns.
    expect(camry.categoryAttributes).toMatchObject({ make: "Toyota", model: "Camry", year: 2018, mileage: 101450 });
    // Source-specific noise is preserved as provenance only.
    expect(camry.rawSourceMetadata).toMatchObject({ rank: 3, experiment_bucket: "b" });
  });

  it("drops duplicate and non-http images", () => {
    expect(sanitizeImages(["https://a.test/1.jpg", "https://a.test/1.jpg", "javascript:alert(1)"]))
      .toEqual(["https://a.test/1.jpg"]);
    expect(sanitizeImages("nope")).toEqual([]);
  });

  it("refuses junk prices, coordinates and future posting times", async () => {
    __setAdapterForTests(createDirtyFixtureAdapter());
    const out = await collectFromAdapter("craigslist", SEARCH);

    // The payload with no URL is unusable and never becomes a row.
    expect(out.normalized).toHaveLength(1);
    const dirty = out.normalized[0]!;
    expect(dirty.title).toBe("Snap-On Tool Chest");
    expect(dirty.price).toBeNull();          // "call for price"
    expect(dirty.latitude).toBeNull();       // 991 is out of range
    expect(dirty.longitude).toBeNull();      // "not-a-number"
    expect(dirty.sourcePostedAt).toBeNull(); // year 2099 is bad data
    expect(dirty.sourcePostedAtReliable).toBe(false);
    expect(dirty.categoryAttributes).toEqual({ brand: "Snap-On", note: "heavy" });
  });

  it("parses prices and timestamps defensively", () => {
    expect(parsePrice("$1,150")).toBe(1150);
    expect(parsePrice("free")).toBeNull();
    expect(parsePrice(-5)).toBe(-5);
    expect(parseTimestamp("not a date")).toBeNull();
    expect(parseTimestamp("2026-01-02T03:04:05Z")).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("identity and deduplication", () => {
  it("prefers the source listing id", () => {
    const id = listingIdentity({ source: "craigslist", sourceListingId: "ff-1001", sourceUrl: "https://x.test/a" });
    expect(id.key).toBe("craigslist:ff-1001");
  });

  it("falls back to a canonical url when the source has no id", () => {
    const id = listingIdentity({
      source: "craigslist",
      sourceListingId: null,
      sourceUrl: "https://x.test/a?utm_source=email#top",
    });
    expect(id.key).toBe("craigslist:url:https://x.test/a");
  });

  it("strips tracking params and trailing slashes from urls", () => {
    expect(canonicalListingUrl("https://x.test/a/?utm_campaign=bump&keep=1#frag"))
      .toBe("https://x.test/a?keep=1");
  });

  it("collapses the same listing seen twice in one page of results", async () => {
    __setAdapterForTests(createFixtureAdapter({ style: "relative" }));
    const out = await collectFromAdapter("craigslist", SEARCH);
    // Both fixture rows are the same item, one with bump/tracking params.
    expect(out.normalized).toHaveLength(1);
    expect(out.normalized[0]!.title).toBe("Gaming PC RTX 3070");
  });
});

describe("timestamps", () => {
  it("marks derived relative ages as unreliable", async () => {
    __setAdapterForTests(createFixtureAdapter({ style: "relative" }));
    const out = await collectFromAdapter("craigslist", SEARCH);
    const listing = out.normalized[0]!;
    expect(listing.sourcePostedAt).not.toBeNull();
    expect(listing.sourcePostedAtReliable).toBe(false);
  });

  it("discards posting time entirely when the source lacks the capability", async () => {
    __setAdapterForTests(
      createFixtureAdapter({
        profileOverrides: {
          capabilities: ["search", "keyword_query", "images", "description"],
        },
      }),
    );
    const out = await collectFromAdapter("craigslist", SEARCH);
    expect(out.normalized[0]!.sourcePostedAt).toBeNull();
    // first_seen_at is core's own sighting and is never confused with posting time.
    expect(out.listings[0]!.postedAt).toBeNull();
    expect(out.listings[0]!.postedAtReliable).toBe(false);
  });
});

describe("capabilities", () => {
  const base: SourceProfile = {
    source: "craigslist",
    capabilities: ["search", "keyword_query"],
    categories: ["vehicles"],
    minCheckIntervalSeconds: 600,
    maxListingsPerCheck: 25,
    accessModel: "Fixture",
    requiresCredentials: false,
  };

  it("flags unsupported filters without blocking the search", () => {
    const v = validateAgainstProfile(base, SEARCH);
    expect(v.ok).toBe(true);
    expect(v.unsupported.join(" ")).toMatch(/radius/i);
    expect(v.unsupported.join(" ")).toMatch(/price/i);
  });

  it("blocks a category the source doesn't carry", () => {
    const v = validateAgainstProfile(base, { ...SEARCH, category: "real_estate" });
    expect(v.ok).toBe(false);
  });

  it("blocks a search with nothing to look for", () => {
    const v = validateAgainstProfile(base, {
      ...SEARCH,
      criteria: { targets: [], keywords: [], exclusions: [], attributes: {} },
    });
    expect(v.ok).toBe(false);
  });

  it("exposes labels for the UI instead of raw keys", () => {
    expect(capabilityLabels(base)).toEqual(["Search", "Keyword Query"]);
    expect(hasCapability(base, "images")).toBe(false);
    expect(hasCapability(null, "search")).toBe(false);
  });

  it("suppresses photos and seller details a source cannot provide", async () => {
    __setAdapterForTests(
      createFixtureAdapter({ profileOverrides: { capabilities: ["search", "posted_time"] } }),
    );
    const out = await collectFromAdapter("craigslist", SEARCH);
    expect(out.listings[0]!.photos).toEqual([]);
    expect(out.listings[0]!.seller).toEqual({});
  });

  it("refuses to run a search on an unconnected source", () => {
    const v = validateSearchForSource("gumtree", SEARCH);
    expect(v.ok).toBe(false);
  });

  it("clamps polling to the slowest selected source's minimum", () => {
    __setAdapterForTests(createFixtureAdapter({ profileOverrides: { minCheckIntervalSeconds: 900 } }));
    expect(clampIntervalForSources(["craigslist"], 60)).toBe(900);
    expect(clampIntervalForSources(["craigslist"], 3600)).toBe(3600);
    // Unknown sources can't loosen the schedule.
    expect(clampIntervalForSources(["facebook"], 120)).toBe(120);
  });

  it("caps listings per check at the profile limit", async () => {
    __setAdapterForTests(createFixtureAdapter({ profileOverrides: { maxListingsPerCheck: 1 } }));
    const out = await collectFromAdapter("craigslist", SEARCH);
    expect(out.normalized).toHaveLength(1);
  });
});

describe("health", () => {
  it("keeps technical detail out of the user-facing copy", async () => {
    __setAdapterForTests(
      createFixtureAdapter({ throwOnSearch: new Error("ECONNRESET https://internal.test/api?token=abc") }),
    );
    await expect(collectFromAdapter("craigslist", SEARCH)).rejects.toThrow(/ECONNRESET/);

    const health = sourceHealth("unavailable", "ECONNRESET https://internal.test");
    expect(health.label).toBe("Unavailable");
    expect(health.detail).not.toMatch(/ECONNRESET|http/);
    expect(health.diagnostic).toMatch(/ECONNRESET/);
  });

  it("surfaces every health state an adapter can report", async () => {
    for (const key of ["healthy", "delayed", "unavailable", "auth_required", "config_required"] as const) {
      __setAdapterForTests(createFixtureAdapter({ health: sourceHealth(key) }));
      const health = await checkSourceHealth("craigslist");
      expect(health.key).toBe(key);
      expect(health.label.length).toBeGreaterThan(0);
    }
  });

  it("degrades a throwing health check to Unavailable", async () => {
    const adapter = createFixtureAdapter();
    adapter.healthCheck = async () => {
      throw new Error("timeout");
    };
    __setAdapterForTests(adapter);
    const health = await checkSourceHealth("craigslist");
    expect(health.key).toBe("unavailable");
    expect(health.diagnostic).toBe("timeout");
  });

  it("reports rate limiting instead of pretending the check succeeded", async () => {
    __setAdapterForTests(createFixtureAdapter({ rateLimited: true }));
    const out = await collectFromAdapter("craigslist", SEARCH);
    expect(out.rateLimited).toBe(true);
    expect(out.retryAfterSeconds).toBe(900);
  });

  it("gives operators the access model without leaking secrets", () => {
    const adapter = createFixtureAdapter();
    const meta = sourceMetadataFor(adapter);
    expect(meta.accessModel).toMatch(/Fixture/);
    expect(meta.requiresCredentials).toBe(false);
    expect(JSON.stringify(meta)).not.toMatch(/token|secret|password/i);
  });
});

describe("core stays source-agnostic", () => {
  it("hands the pipeline an identical shape regardless of source format", async () => {
    const feed = createFixtureAdapter();
    const relative = createFixtureAdapter({ style: "relative" });
    const feedListing = toSourceListing(feed, (await feed.searchListings(SEARCH as never)).listings[0]!);
    const relListing = toSourceListing(relative, (await relative.searchListings(SEARCH as never)).listings[0]!);
    expect(Object.keys(feedListing).sort()).toEqual(Object.keys(relListing).sort());
  });

  it("bridges adapter output through the collector surface the monitor uses", async () => {
    __setAdapterForTests(createFixtureAdapter());
    const collector = getCollector("craigslist")!;
    const result = await collector.collect({
      id: "s-1",
      category: "vehicles",
      criteria: { targets: ["Toyota Camry"], keywords: [], exclusions: [], attributes: {} },
      location: "Ocala, FL",
      radiusMiles: 50,
    });
    expect(result.listings[0]!.title).toBe("2018 Toyota Camry SE");
    expect(result.listings[0]!.externalId).toBe("ff-1001");
  });

  it("builds a complete listing from minimal adapter input", () => {
    const listing = buildAdapterListing("offerup", { sourceUrl: "https://x.test/a", title: " Chair " });
    expect(listing).toMatchObject({
      source: "offerup", title: "Chair", currency: "USD", price: null,
      sellerName: null, images: [], categoryAttributes: {}, sourcePostedAt: null,
    });
  });
});
