import { describe, expect, it } from "vitest";
import { recordTypeId, storedSlugsForRecordType } from "./record-types";

describe("storedSlugsForRecordType", () => {
  it("maps Tax Default to every provider-native spelling it is stored under", () => {
    // The coverage gate and the row reader both key off this. Tax rows land in
    // distress_records / source_coverage as "tax_lien", but the picker slug is
    // "tax_default" — the gate must match either or Hillsborough reads uncovered.
    const slugs = storedSlugsForRecordType("Tax Default / Delinquency");
    expect(slugs).toContain("tax_default");
    expect(slugs).toContain("tax_lien");
    expect(slugs).toContain("tax_deed");
    expect(slugs).toContain("tax_delinquent");
  });

  it("accepts the id form and common aliases too", () => {
    expect(storedSlugsForRecordType("tax_default")).toContain("tax_lien");
    expect(storedSlugsForRecordType("Tax Lien")).toContain("tax_lien");
  });

  it("falls back to the canonical slug when there is no divergence", () => {
    expect(storedSlugsForRecordType("Probate")).toEqual(["probate"]);
    expect(recordTypeId("Probate")).toBe("probate");
  });

  it("returns nothing for an empty/unknown input", () => {
    expect(storedSlugsForRecordType(null)).toEqual([]);
    expect(storedSlugsForRecordType("")).toEqual([]);
  });
});
