import { describe, expect, it, vi, beforeEach } from "vitest";

const rows = [
  {
    id: "r1",
    owner_first: "Jane",
    owner_last: "Doe",
    record_type: "probate",
    county: "Hillsborough",
    fips: "12057",
    state: "FL",
    property_address: "1 Oak St",
  },
  {
    id: "r2",
    owner_last: "Smith",
    record_type: "probate",
    county: "Hillsborough",
    fips: "12057",
    state: "FL",
    property_address: "2 Oak St",
  },
];

vi.mock("@/integrations/supabase/client.server", () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    in: chain,
    ilike: chain,
    eq: chain,
    gte: chain,
    lte: chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  });
  return { supabaseAdmin: { from: () => builder } };
});

vi.mock("./distress/coverage.server", () => ({
  splitSelections: async () => ({
    covered: [{ county: "Hillsborough, FL", recordType: "Probate" }],
    uncovered: [],
    coveredCounties: ["Hillsborough, FL"],
    uncoveredCounties: [],
  }),
  coveredFipsForCounty: async () => ["12057"],
  NoCoverageError: class extends Error {},
}));

vi.mock("./data-providers/county-records", () => ({
  hasLiveCountyScraper: () => false,
  scrapeCountyRecords: async () => [],
}));

vi.mock("./data-providers/source-registry.server", () => ({
  fetchCatalogedRecords: async () => [],
}));

// Live pull finds nothing and is NOT account-scoped → the warehouse fallback
// must still serve the covered county (testing-period behavior).
vi.mock("./data-providers/realeflow-live.server", () => ({
  isLiveServable: () => true,
  liveRealeflowPull: async () => ({ resolved: true, accountScoped: false, leads: [] }),
}));

describe("recordsAdapter distress_records fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns stored rows for a covered county with no scraper and no catalog", async () => {
    const { recordsAdapter } = await import("./pipeline.server");
    const out: { coverage?: { ran: number } } = {};
    const progress: string[] = [];
    const leads = await recordsAdapter.run(
      { counties: ["Hillsborough, FL"], record_types: ["Probate"] },
      (m) => void progress.push(m),
      out as never,
    );
    expect(leads.length).toBe(2);
    expect(leads[0]!.full_name).toBe("Jane Doe");
    expect(out.coverage?.ran).toBe(1);
    expect(progress.some((m) => m.includes("distress feed"))).toBe(true);
  });

  it("LICENSE GATE: an account-scoped live pull is never backfilled from the warehouse", async () => {
    vi.resetModules();
    vi.doMock("./data-providers/realeflow-live.server", () => ({
      isLiveServable: () => true,
      // The user's own account ran and found nothing — pooled rows must NOT
      // be redistributed into their list (Tyler's no-pooling rule).
      liveRealeflowPull: async () => ({ resolved: true, accountScoped: true, leads: [] }),
    }));
    const { recordsAdapter } = await import("./pipeline.server");
    const leads = await recordsAdapter.run(
      { counties: ["Hillsborough, FL"], record_types: ["Probate"], actor_user_id: "u1" },
      undefined,
      {} as never,
    );
    expect(leads.length).toBe(0);
  });
});
