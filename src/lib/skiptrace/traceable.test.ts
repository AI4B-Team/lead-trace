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

// Composition test: distress-fallback rows with no phone get traced and then
// survive the mobile-only final carrier gate (the "Clean > 0" path).
describe("distress rows survive the mobile gate after tracing", () => {
  it("traces phone-less distress rows and keeps them clean", async () => {
    const { verifyPending, verifyNewlyTraced, classifyLineType } = await import("../line-type");
    const rows = [
      { full_name: "Jane Doe", phone: null as string | null, address: "1 Oak St", source_meta: { source: "distress_feed" } },
      { full_name: "John Smith", phone: null as string | null, address: "2 Oak St", source_meta: { source: "distress_feed" } },
    ];
    // Mobile per classifyLineType (exchange bucket not 0 or 1).
    const traced = "8135550123";
    expect(classifyLineType(traced)).toBe("mobile");

    const verified = verifyPending(rows, true).kept;
    expect(verified.length).toBe(2);

    let skiptraced = 0;
    for (const r of verified) {
      if (!isTraceableRecordsLead(r)) continue;
      if ((r.phone ?? "").replace(/\D/g, "")) continue;
      r.phone = traced;
      r.line_type = classifyLineType(traced);
      skiptraced++;
    }
    expect(skiptraced).toBe(2);

    const gate = verifyNewlyTraced(verified, true);
    expect(gate.kept.length).toBe(2);
    expect(gate.removedNoPhone).toBe(0);
  });

  it("keeps phone-less distress rows as property leads when no phone vendor returns a number", async () => {
    const { verifyPending, verifyNewlyTraced } = await import("../line-type");
    const rows = [
      { full_name: "A", phone: null as string | null, address: "1 Oak St", source_meta: { source: "distress_feed" } },
      { full_name: "B", phone: null as string | null, address: "2 Oak St", source_meta: { source: "distress_feed" } },
      { full_name: "C", phone: null as string | null, address: "3 Oak St", source_meta: { source: "distress_feed" } },
    ];
    const verified = verifyPending(rows, true).kept;
    const gate = verifyNewlyTraced(verified, true, { keepPhoneless: isTraceableRecordsLead });
    expect(gate.keptPhonelessProperty).toBe(3);
    expect(gate.removedNoPhone).toBe(0);
    const leadRows = gate.kept.map((r) => ({ phone: r.phone ?? null, address: r.address }));
    expect(leadRows).toHaveLength(3);
    expect(leadRows.every((r) => r.phone === null && r.address)).toBe(true);
  });
});
