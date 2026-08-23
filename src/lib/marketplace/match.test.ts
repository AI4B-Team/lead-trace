import { describe, expect, it } from "vitest";
import { EMPTY_CRITERIA } from "./catalog.shared";
import { extractDeterministic } from "./extract.shared";
import {
  DEFAULT_MIN_MATCH_SCORE, evaluateMatch, groupCriteria, meetsThreshold, prefilter,
  type MatchSearchSpec, type NormalizedListing,
} from "./match.shared";

const camrySpec: MatchSearchSpec = {
  category: "vehicles",
  criteria: {
    ...EMPTY_CRITERIA,
    targets: ["Toyota Camry"],
    priceMax: 8000,
    attributes: {
      year_min: 2015,
      year_max: 2021,
      mileage_max: 130000,
      title_status: "clean",
      seller_type: "private",
    },
  },
  radiusMiles: 75,
};

function camryListing(): NormalizedListing {
  const attrs = extractDeterministic(
    "vehicles",
    "2018 Toyota Camry SE",
    "101,000 miles. Clean title in hand. Private owner selling, no dealers.",
    {},
  );
  return {
    title: "2018 Toyota Camry SE",
    description: "101,000 miles. Clean title in hand. Private owner selling, no dealers.",
    price: 6500,
    category: "vehicles",
    locationText: "Tampa, FL",
    distanceMiles: 18,
    attributes: attrs,
  };
}

describe("marketplace match scoring", () => {
  it("scores the reference Camry listing in the high 90s with an unknown, not a mismatch", () => {
    const result = evaluateMatch(camryListing(), camrySpec);
    const groups = groupCriteria(result.criteria);

    expect(groups.mismatched).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(94);
    expect(result.score).toBeLessThanOrEqual(100);
    // Unspecified fields register as unknown rather than failing the listing.
    expect(groups.unknown.length).toBeGreaterThan(0);
    expect(groups.unknown.every((c) => c.state === "unknown")).toBe(true);
  });

  it("labels the matched criteria from the user's own search", () => {
    const labels = groupCriteria(evaluateMatch(camryListing(), camrySpec).criteria).matched.map(
      (c) => c.label,
    );
    expect(labels).toContain("Toyota Camry");
    expect(labels).toContain("Under Maximum Price ($8,000)");
    expect(labels).toContain("Clean Title");
    expect(labels).toContain("Within Search Radius (75 Miles)");
  });

  it("treats missing information as unknown, never as not matched", () => {
    const bare: NormalizedListing = {
      title: "Toyota Camry",
      description: null,
      price: 6500,
      category: "vehicles",
      locationText: null,
      distanceMiles: null,
      attributes: {},
    };
    const { criteria } = evaluateMatch(bare, camrySpec);
    const title = criteria.find((c) => c.key === "attr.title_status");
    expect(title?.state).toBe("unknown");
    expect(criteria.find((c) => c.key === "radius")?.state).toBe("unknown");
  });

  it("scores a real mismatch below an unknown", () => {
    const salvage = camryListing();
    salvage.attributes.title_status = { value: "salvage", confidence: "high" };
    const withMismatch = evaluateMatch(salvage, camrySpec).score;
    const withUnknown = evaluateMatch(
      { ...camryListing(), attributes: { ...camryListing().attributes, title_status: undefined as never } },
      camrySpec,
    ).score;
    expect(withMismatch).toBeLessThan(withUnknown);
  });

  it("lowers the score when an extracted value is low confidence", () => {
    const shaky = camryListing();
    shaky.attributes.title_status = { value: "clean", confidence: "low" };
    expect(evaluateMatch(shaky, camrySpec).score).toBeLessThan(
      evaluateMatch(camryListing(), camrySpec).score,
    );
  });
});

describe("deterministic prefilter", () => {
  it("disqualifies listings far above the maximum price", () => {
    const l = { ...camryListing(), price: 19000 };
    expect(prefilter(l, camrySpec).disqualified).toBe(true);
  });

  it("disqualifies listings well outside the radius", () => {
    const l = { ...camryListing(), distanceMiles: 400 };
    expect(prefilter(l, camrySpec).disqualified).toBe(true);
  });

  it("disqualifies listings that never mention the target", () => {
    const l = { ...camryListing(), title: "2018 Ford Fusion SE", description: "Clean title" };
    expect(prefilter(l, camrySpec).disqualified).toBe(true);
  });

  it("keeps borderline listings so they still get scored", () => {
    const l = { ...camryListing(), price: 8400, distanceMiles: 80 };
    expect(prefilter(l, camrySpec).disqualified).toBe(false);
  });

  it("respects exclusions", () => {
    const spec = { ...camrySpec, criteria: { ...camrySpec.criteria, exclusions: ["salvage"] } };
    const l = { ...camryListing(), description: "salvage title, runs great" };
    expect(prefilter(l, spec).disqualified).toBe(true);
  });
});

describe("attribute extraction", () => {
  it("reads vehicle facts the listing actually states", () => {
    const a = extractDeterministic(
      "vehicles",
      "2016 Honda Accord EX",
      "88k miles, clean title, automatic, private party. VIN 1HGCR2F3XGA123456",
      {},
    );
    expect(a.year?.value).toBe(2016);
    expect(a.mileage?.value).toBe(88000);
    expect(a.title_status?.value).toBe("clean");
    expect(a.transmission?.value).toBe("automatic");
    expect(a.seller_type?.value).toBe("private");
    expect(a.vin?.value).toBe("1HGCR2F3XGA123456");
  });

  it("does not force a vehicle schema onto other categories", () => {
    const a = extractDeterministic(
      "electronics",
      "MacBook Pro 512GB unlocked",
      "Sealed in box",
      {},
    );
    expect(a.storage?.value).toBe("512GB");
    expect(a.lock_status?.value).toBe("unlocked");
    expect(a.condition?.value).toBe("new");
    expect(a.mileage).toBeUndefined();
  });

  it("trusts source-provided structured fields at high confidence", () => {
    const a = extractDeterministic("furniture", "Oak Dining Table", null, { material: "oak" });
    expect(a.material).toEqual({ value: "oak", confidence: "high" });
  });
});

describe("alert threshold", () => {
  it("defaults to 80 and gates on the Match Score", () => {
    expect(DEFAULT_MIN_MATCH_SCORE).toBe(80);
    expect(meetsThreshold(80, 80)).toBe(true);
    expect(meetsThreshold(79, 80)).toBe(false);
    expect(meetsThreshold(95, 90)).toBe(true);
  });
});

describe("multiple targets", () => {
  it("treats several targets as alternatives, not as all-required", () => {
    const spec: MatchSearchSpec = {
      ...camrySpec,
      criteria: { ...camrySpec.criteria, targets: ["Toyota Camry", "Honda Accord"] },
    };
    const result = evaluateMatch(camryListing(), spec);
    const target = result.criteria.find((c) => c.key === "targets");
    expect(target?.state).toBe("matched");
    expect(target?.label).toBe("Toyota Camry");
    expect(result.score).toBeGreaterThanOrEqual(94);
  });

  it("fails only when none of the targets appear", () => {
    const spec: MatchSearchSpec = {
      ...camrySpec,
      criteria: { ...camrySpec.criteria, targets: ["Toyota Camry", "Honda Accord"] },
    };
    const other = { ...camryListing(), title: "2018 Kia Optima EX", description: "Clean title" };
    expect(evaluateMatch(other, spec).criteria.find((c) => c.key === "targets")?.state).toBe(
      "not_matched",
    );
  });
});
