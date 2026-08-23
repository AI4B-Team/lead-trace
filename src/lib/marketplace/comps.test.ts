import { describe, expect, it } from "vitest";
import {
  compCacheKey, compsCtaLabel, marketDifferenceLabel, rankComps, summarizeComps,
  type CompCandidate, type CompSubject,
} from "./comps.shared";

const subject: CompSubject = {
  title: "2018 Toyota Camry SE",
  price: 6500,
  category: "vehicles",
  locationText: "Tampa, FL",
  distanceMiles: 0,
  attributes: { make: "Toyota", model: "Camry", trim: "SE", year: 2018, mileage: 101000, title_status: "clean" },
  radiusMiles: 50,
};

function comp(i: number, price: number, over: Partial<CompCandidate> = {}): CompCandidate {
  return {
    id: `c${i}`,
    source: "leadtrace_observed",
    sourceLabel: "LeadTrace Observed Listings",
    sourceKind: "observed_listing",
    listingUrl: `https://example.com/${i}`,
    title: "2018 Toyota Camry SE",
    price,
    priceKind: "asking",
    observedAt: new Date().toISOString(),
    locationText: "Tampa, FL",
    distanceMiles: 14,
    attributes: { make: "Toyota", model: "Camry", trim: "SE", year: 2018, mileage: 108000, title_status: "clean" },
    ...over,
  };
}

describe("comp ranking", () => {
  it("scores a near-identical listing high and keeps it usable", () => {
    const [c] = rankComps(subject, [comp(1, 9495)]);
    expect(c.similarity).toBeGreaterThan(90);
    expect(c.usable).toBe(true);
  });

  it("excludes a different model from the range but still returns it", () => {
    const [c] = rankComps(subject, [comp(1, 9495, { attributes: { make: "Honda", model: "Accord", year: 2018 } })]);
    expect(c.usable).toBe(false);
    expect(c.unusableReason).toMatch(/Differs/);
  });

  it("drops candidates with no price", () => {
    expect(rankComps(subject, [comp(1, 0, { price: null })])).toHaveLength(0);
  });
});

describe("comp summary", () => {
  it("refuses a range with too little evidence", () => {
    const s = summarizeComps(subject, rankComps(subject, [comp(1, 9400), comp(2, 9800)]));
    expect(s.status).toBe("insufficient");
    expect(s.rangeLow).toBeNull();
    expect(s.confidence).toBe("low");
  });

  it("reports a range and a below-range market difference", () => {
    const prices = [9200, 9400, 9500, 9650, 9800, 9950, 10100, 10200];
    const s = summarizeComps(subject, rankComps(subject, prices.map((p, i) => comp(i, p))));
    expect(s.status).toBe("sufficient");
    expect(s.direction).toBe("below");
    expect(s.rangeLow!).toBeGreaterThan(subject.price!);
    expect(marketDifferenceLabel(s)).toMatch(/Below Comparable Range$/);
    expect(marketDifferenceLabel(s)).not.toMatch(/Profit/);
  });

  it("prefers sold comps as the basis and never blends them with asking", () => {
    const asking = [7000, 7200, 7400, 7600].map((p, i) => comp(i, p));
    const sold = [9500, 9700, 9900].map((p, i) =>
      comp(100 + i, p, { priceKind: "sold" as const }),
    );
    const s = summarizeComps(subject, rankComps(subject, [...asking, ...sold]));
    expect(s.basis).toBe("sold");
    expect(s.rangeLow!).toBeGreaterThanOrEqual(9500);
    expect(s.askingCount).toBe(4);
    expect(s.soldCount).toBe(3);
  });

  it("caps confidence when the comp set is small", () => {
    const s = summarizeComps(subject, rankComps(subject, [9400, 9600, 9800].map((p, i) => comp(i, p))));
    expect(s.confidence).not.toBe("high");
  });
});

describe("cache identity", () => {
  it("keys on identity plus geography, not the free-text title", () => {
    const a = compCacheKey(subject);
    const b = compCacheKey({ ...subject, title: "Camry 2018 se — clean!!" });
    expect(a).toBe(b);
    expect(compCacheKey({ ...subject, radiusMiles: 250 })).not.toBe(a);
  });
});

describe("cta label", () => {
  it("switches to a comp count once comps exist", () => {
    expect(compsCtaLabel(null)).toBe("Check Comps");
    expect(compsCtaLabel(17)).toBe("View 17 Comps");
    expect(compsCtaLabel(1)).toBe("View 1 Comp");
  });
});
