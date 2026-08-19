import { describe, expect, it } from "vitest";
import { isTraceableRecordsLead, hasTraceableRecordsRows } from "./traceable";

describe("isTraceableRecordsLead", () => {
  it("treats distress_feed rows with an address as traceable", () => {
    expect(
      isTraceableRecordsLead({ address: "1 Oak St", source_meta: { source: "distress_feed" } }),
    ).toBe(true);
  });

  it("still treats live-scraper rows as traceable", () => {
    expect(isTraceableRecordsLead({ address: "1 Oak St", source_meta: { provider: "cook-il" } })).toBe(
      true,
    );
  });

  it("rejects rows with no address", () => {
    expect(isTraceableRecordsLead({ address: null, source_meta: { source: "distress_feed" } })).toBe(
      false,
    );
  });

  it("rejects unrelated sources", () => {
    expect(isTraceableRecordsLead({ address: "1 Oak St", source_meta: { source: "upload" } })).toBe(
      false,
    );
  });

  it("hasTraceableRecordsRows finds one among many", () => {
    expect(
      hasTraceableRecordsRows([
        { address: null, source_meta: {} },
        { address: "2 Oak St", source_meta: { source: "distress_feed" } },
      ]),
    ).toBe(true);
  });
});
