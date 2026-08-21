import { describe, expect, it } from "vitest";
import {
  isTraceableRecordsLead,
  hasTraceableRecordsRows,
  isSurplusPropertyLead,
  isKeepablePropertyLead,
} from "./traceable";

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

describe("isSurplusPropertyLead / isKeepablePropertyLead", () => {
  // Marion FL: owner-less, address-less surplus list — only a parcel + balance.
  const marionRow = {
    address: null as string | null,
    source_meta: {
      source: "distress_feed",
      record_type: "surplus_funds",
      surplus_amount: 6870.5,
      parcel_apn: "1814-026-017",
    },
  };

  it("keeps a parcel-only confirmed surplus row (no phone, no address)", () => {
    expect(isSurplusPropertyLead(marionRow)).toBe(true);
    // Not skip-traceable (no address), but still worth keeping in the master.
    expect(isTraceableRecordsLead(marionRow)).toBe(false);
    expect(isKeepablePropertyLead(marionRow)).toBe(true);
  });

  it("rejects a surplus row with no parcel to key on", () => {
    expect(
      isSurplusPropertyLead({
        address: null,
        source_meta: { record_type: "surplus_funds", surplus_amount: 100 },
      }),
    ).toBe(false);
  });

  it("rejects a surplus row with no confirmed amount", () => {
    expect(
      isSurplusPropertyLead({
        address: null,
        source_meta: { record_type: "surplus_funds", parcel_apn: "1814-026-017" },
      }),
    ).toBe(false);
  });

  it("rejects a non-surplus parcel row (probate with a parcel is not a surplus balance)", () => {
    expect(
      isSurplusPropertyLead({
        address: null,
        source_meta: { record_type: "probate", surplus_amount: 100, parcel_apn: "X" },
      }),
    ).toBe(false);
  });

  it("still keeps an address-carrying property row via the traceable path", () => {
    const dekalb = {
      address: "470 Varner St",
      source_meta: { source: "distress_feed", record_type: "surplus_funds" },
    };
    expect(isKeepablePropertyLead(dekalb)).toBe(true);
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
