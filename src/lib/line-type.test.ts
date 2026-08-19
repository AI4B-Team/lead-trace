import { describe, expect, it } from "vitest";
import { classifyLineType, verifyLineTypes, verifyNewlyTraced } from "./line-type";

describe("line type verification", () => {
  it("classifies by carrier exchange", () => {
    expect(classifyLineType("+18132001234")).toBe("landline"); // exchange 200
    expect(classifyLineType("+18132011234")).toBe("voip"); // exchange 201
    expect(classifyLineType("+18132021234")).toBe("mobile"); // exchange 202
    expect(classifyLineType("123")).toBe("unknown");
    expect(classifyLineType(null)).toBe("unknown");
  });

  it("removes landline and voip rows when Mobile Numbers Only is on", () => {
    const rows = [
      { phone: "+18132001234" }, // landline
      { phone: "+18132011234" }, // voip
      { phone: "+18132021234" }, // mobile
      { phone: "+18132031234" }, // mobile
      { phone: null }, // unknown
    ];
    const res = verifyLineTypes(rows, true);
    expect(res.kept).toHaveLength(2);
    expect(res.removed).toBe(3);
    expect(res.counts).toEqual({ mobile: 2, landline: 1, voip: 1, unknown: 1 });
    expect(res.kept.every((r) => r.line_type === "mobile")).toBe(true);
  });

  it("keeps every row but still tags line types when the toggle is off", () => {
    const rows = [{ phone: "+18132001234" }, { phone: "+18132021234" }];
    const res = verifyLineTypes(rows, false);
    expect(res.removed).toBe(0);
    expect(res.kept.map((r) => r.line_type)).toEqual(["landline", "mobile"]);
  });
});

describe("verifyNewlyTraced (final carrier gate)", () => {
  it("never re-evaluates a row that already passed as mobile", () => {
    const rows = [
      { phone: "312-555-0100", line_type: "mobile" as const }, // already verified
      { phone: "312-201-0110" }, // newly traced, voip bucket
    ];
    const gate = verifyNewlyTraced(rows, true);
    expect(gate.alreadyMobile).toBe(1);
    expect(gate.evaluated).toBe(1);
    expect(gate.removedNotMobile + gate.removedNoPhone).toBe(1);
    expect(gate.kept).toHaveLength(1);
    expect(gate.kept[0]!.phone).toBe("312-555-0100");
  });

  it("separates no-phone drops from not-mobile drops", () => {
    const gate = verifyNewlyTraced([{ phone: null }, { phone: "312-555-0100" }], true);
    expect(gate.removedNoPhone).toBe(1);
    expect(gate.removedNotMobile).toBe(0);
    expect(gate.kept).toHaveLength(1);
  });

  it("keeps phoneless property leads and still drops other phoneless rows", () => {
    const rows = [
      { phone: null as string | null, isProperty: true },
      { phone: null as string | null, isProperty: false },
      { phone: "312-200-0100", isProperty: true }, // landline that DID come back
    ];
    const gate = verifyNewlyTraced(rows, true, { keepPhoneless: (r) => r.isProperty });
    expect(gate.keptPhonelessProperty).toBe(1);
    expect(gate.removedNoPhone).toBe(1);
    expect(gate.removedNotMobile).toBe(1);
    expect(gate.kept).toHaveLength(1);
    expect(gate.kept[0]!.phone).toBeNull();
  });
});
