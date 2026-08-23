/**
 * Adapter test fixtures: raw-shaped payloads in three deliberately different
 * source formats. They exist so normalization, identity, deduplication,
 * timestamps and category attributes can all be verified with ZERO live
 * marketplace requests during ordinary automated tests.
 *
 * These are hand-written samples, not captured production data, and no adapter
 * in the shipping registry uses them.
 */

/** Feed-style payload: snake_case, explicit coordinates, ISO posting time. */
export const FEED_STYLE_PAYLOADS = [
  {
    listing_id: "ff-1001",
    permalink: "https://example-marketplace.test/item/ff-1001?utm_source=email&ref=feed",
    name: "2018 Toyota Camry SE",
    body: "Clean title, one owner, new tires. 101,450 miles.",
    amount: "$6,500",
    currency_code: "usd",
    place: "Ocala, FL",
    lat: 29.1872,
    lon: -82.1401,
    distance_mi: 18,
    posted_time: "2026-08-23T14:05:00.000Z",
    seller: { display_name: "Marcus R.", joined_year: 2019, verified: true, internal_score: null },
    photos: [
      "https://cdn.example-marketplace.test/ff-1001/1.jpg",
      "https://cdn.example-marketplace.test/ff-1001/1.jpg",
      "javascript:alert(1)",
    ],
    specs: { make: "Toyota", model: "Camry", year: 2018, mileage: 101450, title_status: "clean", extra: null },
    internal: { rank: 3, experiment_bucket: "b" },
  },
  {
    listing_id: "ff-1002",
    permalink: "https://example-marketplace.test/item/ff-1002",
    name: "Craftsman Table Saw",
    body: null,
    amount: 240,
    place: "Gainesville, FL",
    posted_time: "2026-08-22T09:30:00.000Z",
    specs: { brand: "Craftsman", condition: "used" },
  },
] as const;

/** Scrape-free "relative time" payload: no stable id, human-readable age. */
export const RELATIVE_TIME_PAYLOADS = [
  {
    url: "https://other-marketplace.test/listings/gaming-pc-9931",
    heading: "Gaming PC RTX 3070",
    price_text: "1,150",
    city: "Tampa",
    age_text: "2 days ago",
    thumbnails: ["https://cdn.other-marketplace.test/9931.jpg"],
    facts: { gpu: "RTX 3070", storage: "1TB" },
  },
  {
    // Same item, resurfaced with tracking params — must dedupe to one listing.
    url: "https://other-marketplace.test/listings/gaming-pc-9931?utm_campaign=bump#top",
    heading: "Gaming PC RTX 3070",
    price_text: "1,150",
    city: "Tampa",
    age_text: "1 hour ago",
    facts: { gpu: "RTX 3070" },
  },
] as const;

/** Payload with a bad posting time and junk values, to prove the guards work. */
export const DIRTY_PAYLOADS = [
  {
    listing_id: "dd-1",
    permalink: "https://example-marketplace.test/item/dd-1",
    name: "   Snap-On Tool Chest   ",
    amount: "call for price",
    currency_code: "USD",
    place: "Orlando, FL",
    lat: 991,
    lon: "not-a-number",
    posted_time: "2099-01-01T00:00:00.000Z",
    photos: "nope",
    specs: { brand: "Snap-On", weight: Number.NaN, note: "  heavy  " },
  },
  {
    // No URL: unusable, must be dropped rather than stored as a broken row.
    listing_id: "dd-2",
    permalink: "",
    name: "Mystery Item",
  },
] as const;
