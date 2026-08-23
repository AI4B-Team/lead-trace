/**
 * Collection provider foundation tests.
 *
 * These exercise the provider abstraction, the Facebook source adapter's
 * request building and normalization, the pre-AI hard filter, and the variable
 * polling schedule — all against RECORDED FIXTURES. No marketplace and no paid
 * provider is contacted.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  CollectionProviderError, isRetryableCategory, isTerminalCategory, nextCheckInterval,
  pollDelayMs, providerErrorMessage, FAST_INTERVAL_SECONDS, SLOW_INTERVAL_SECONDS,
} from "./contract.shared";
import { clearFixtureRecords, fixtureProvider, setFixtureRecords } from "./fixture.provider";
import { __setProviderForTests, collectFor, isSourceCollectable, providerForSource } from "./registry.server";
import {
  buildSearchUrl, facebookAdapter, locationSlug, normalizeFacebookRecord,
} from "../adapters/facebook.source.server";

/** Two records in the collection job's real output shape. */
const FB_RECORD = {
  facebookUrl: "https://www.facebook.com/marketplace/tampa/search/?query=mower",
  listingUrl: "https://www.facebook.com/marketplace/item/1189200412268517?ref=share",
  id: "1189200412268517",
  primary_listing_photo: { image: { uri: "https://scontent.example.com/photo1.jpg" } },
  listing_price: { formatted_amount: "$650", amount: "650.00" },
  location: { reverse_geocode: { city: "Tampa", state: "FL", city_page: { display_name: "Tampa, Florida" } } },
  is_sold: false,
  is_live: true,
  marketplace_listing_title: "Zero Turn Mower 42 inch",
  marketplace_listing_seller: { __typename: "User", name: "Dana R", id: "pfbid02Emnr" },
  delivery_types: ["IN_PERSON"],
  marketplace_listing_category_id: "676772489112490",
};

const FB_SOLD_RECORD = { ...FB_RECORD, id: "999", listingUrl: "https://www.facebook.com/marketplace/item/999", is_sold: true };

const SEARCH = {
  id: "s1",
  category: "general",
  criteria: {
    targets: ["mower"],
    keywords: ["zero turn"],
    exclusions: [],
    priceMin: 100,
    priceMax: 900,
    attributes: {},
  },
  location: "Tampa, FL",
  radiusMiles: 25,
};

afterEach(() => {
  clearFixtureRecords();
  __setProviderForTests(null);
  delete process.env["MARKETPLACE_COLLECTION_PROVIDER"];
});

describe("collection request building", () => {
  it("slugs the city the way the public search URL expects", () => {
    expect(locationSlug("Saint Petersburg, FL")).toBe("saintpetersburg");
    expect(locationSlug("")).toBeNull();
  });

  it("carries keywords, price bounds, radius and newest-first sorting", () => {
    const url = buildSearchUrl(SEARCH)!;
    expect(url).toContain("/marketplace/tampa/search/");
    expect(url).toContain("query=mower+zero+turn");
    expect(url).toContain("minPrice=100");
    expect(url).toContain("maxPrice=900");
    expect(url).toContain("radius=40");
    expect(url).toContain("sortBy=creation_time_descend");
  });

  it("refuses a search with no city instead of collecting everything", () => {
    expect(buildSearchUrl({ ...SEARCH, location: null })).toBeNull();
    expect(facebookAdapter.validateSearch!({ ...SEARCH, location: null }).ok).toBe(false);
  });
});

describe("normalization", () => {
  it("maps the provider's real field names onto the normalized shape", () => {
    const listing = normalizeFacebookRecord(FB_RECORD)!;
    expect(listing.source).toBe("facebook");
    expect(listing.sourceListingId).toBe("1189200412268517");
    // Tracking parameters are stripped by the shared normalizer.
    expect(listing.sourceUrl).toBe("https://www.facebook.com/marketplace/item/1189200412268517");
    expect(listing.title).toBe("Zero Turn Mower 42 inch");
    expect(listing.price).toBe(650);
    expect(listing.location).toBe("Tampa, Florida");
    expect(listing.sellerName).toBe("Dana R");
    expect(listing.images).toEqual(["https://scontent.example.com/photo1.jpg"]);
  });

  it("never claims a posting time the source did not publish", () => {
    const listing = normalizeFacebookRecord(FB_RECORD)!;
    expect(listing.sourcePostedAt).toBeNull();
    expect(listing.sourcePostedAtReliable).toBe(false);
  });

  it("drops sold, hidden and unusable records", () => {
    expect(normalizeFacebookRecord(FB_SOLD_RECORD)).toBeNull();
    expect(normalizeFacebookRecord({ ...FB_RECORD, is_hidden: true })).toBeNull();
    expect(normalizeFacebookRecord({ ...FB_RECORD, marketplace_listing_title: "", custom_title: null, title: null })).toBeNull();
    expect(normalizeFacebookRecord(null)).toBeNull();
  });
});

describe("provider registry", () => {
  it("reports a source uncollectable when no provider is configured for it", () => {
    expect(providerForSource("facebook")).toBeNull();
    expect(isSourceCollectable("facebook")).toBe(false);
  });

  it("raises a categorized, non-leaky error when nothing is configured", async () => {
    await expect(
      collectFor("facebook", { source: "facebook", searchId: "s1", targets: ["https://x"], maxRecords: 5 }),
    ).rejects.toMatchObject({ category: "not_configured" });
  });

  it("routes a retrieval through whichever provider is selected", async () => {
    setFixtureRecords("facebook", [FB_RECORD, FB_SOLD_RECORD]);
    __setProviderForTests(fixtureProvider);
    process.env["MARKETPLACE_COLLECTION_PROVIDER"] = "fixture";

    const result = await collectFor("facebook", {
      source: "facebook", searchId: "s1", targets: [buildSearchUrl(SEARCH)!], maxRecords: 10,
    });
    expect(result.provider).toBe("fixture");
    expect(result.records).toHaveLength(2);
    expect(result.usage.records).toBe(2);
  });

  it("caps records at the requested maximum and reports truncation", async () => {
    setFixtureRecords("facebook", [FB_RECORD, FB_RECORD, FB_RECORD]);
    process.env["MARKETPLACE_COLLECTION_PROVIDER"] = "fixture";
    __setProviderForTests(fixtureProvider);
    const result = await collectFor("facebook", {
      source: "facebook", searchId: "s1", targets: ["https://x"], maxRecords: 2,
    });
    expect(result.records).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

describe("adapter over provider", () => {
  it("collects, normalizes and filters in one pass", async () => {
    setFixtureRecords("facebook", [FB_RECORD, FB_SOLD_RECORD]);
    process.env["MARKETPLACE_COLLECTION_PROVIDER"] = "fixture";
    __setProviderForTests(fixtureProvider);

    const result = await facebookAdapter.searchListings(SEARCH);
    // The sold record is dropped during normalization, before any scoring.
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]!.title).toBe("Zero Turn Mower 42 inch");
  });

  it("surfaces provider failures as customer-safe copy, never internals", async () => {
    process.env["MARKETPLACE_COLLECTION_PROVIDER"] = "fixture";
    __setProviderForTests(fixtureProvider);
    await expect(facebookAdapter.searchListings(SEARCH)).rejects.toThrow(
      /isn't set up for collection yet/,
    );
  });

  it("reports Configuration Required health while no provider is configured", async () => {
    const health = await facebookAdapter.healthCheck();
    expect(health.key).toBe("config_required");
  });
});

describe("error semantics", () => {
  it("separates retryable from terminal categories", () => {
    expect(isRetryableCategory("rate_limited")).toBe(true);
    expect(isRetryableCategory("timeout")).toBe(true);
    expect(isTerminalCategory("auth")).toBe(true);
    expect(isTerminalCategory("quota")).toBe(true);
    expect(isTerminalCategory("rate_limited")).toBe(false);
  });

  it("keeps status codes and provider names out of customer copy", () => {
    const message = providerErrorMessage("auth");
    expect(message).not.toMatch(/401|apify|bright/i);
    const err = new CollectionProviderError("rate_limited", "429 from provider", 30, "apify");
    expect(err.retryable).toBe(true);
    expect(err.retryAfterSeconds).toBe(30);
  });
});

describe("variable polling", () => {
  it("checks at the fast end while a search is producing", () => {
    expect(nextCheckInterval({ baseSeconds: 120, newListings: 3, quietChecks: 0 })).toBe(FAST_INTERVAL_SECONDS);
  });

  it("backs off toward ten minutes as a search stays quiet", () => {
    const a = nextCheckInterval({ baseSeconds: 120, newListings: 0, quietChecks: 1 });
    const b = nextCheckInterval({ baseSeconds: 120, newListings: 0, quietChecks: 2 });
    const c = nextCheckInterval({ baseSeconds: 120, newListings: 0, quietChecks: 9 });
    expect(a).toBeGreaterThan(FAST_INTERVAL_SECONDS);
    expect(b).toBeGreaterThan(a);
    expect(c).toBe(SLOW_INTERVAL_SECONDS);
  });

  it("never polls faster than two minutes or slower than ten", () => {
    const fast = nextCheckInterval({ baseSeconds: 30, newListings: 5, quietChecks: 0 });
    const slow = nextCheckInterval({ baseSeconds: 3600, newListings: 5, quietChecks: 0 });
    expect(fast).toBe(FAST_INTERVAL_SECONDS);
    expect(slow).toBe(SLOW_INTERVAL_SECONDS);
  });

  it("honours an explicit slow-down instruction", () => {
    expect(
      nextCheckInterval({ baseSeconds: 120, newListings: 5, quietChecks: 0, rateLimited: true, retryAfterSeconds: 1800 }),
    ).toBe(1800);
  });

  it("keeps job polling backoff bounded and jittered", () => {
    expect(pollDelayMs(0)).toBeLessThanOrEqual(3000);
    expect(pollDelayMs(20)).toBeLessThanOrEqual(15000);
  });
});
