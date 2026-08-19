import { describe, expect, it } from "vitest";
import {
  defaultRecordTypeLabelForTemplate,
  detectRecordType,
  recordTypeId,
  storedSlugsForRecordType,
} from "./record-types";

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

describe("defaultRecordTypeLabelForTemplate", () => {
  it("gives a single-type records preset its Record Type label", () => {
    // Selecting the Tax Defaults preset (templateId "tax") must pre-fill the
    // Record Type, or the Assembling checklist stalls forever on that slot.
    expect(defaultRecordTypeLabelForTemplate("tax")).toBe("Tax Default / Delinquency");
    expect(defaultRecordTypeLabelForTemplate("probate")).toBe("Probate");
    expect(defaultRecordTypeLabelForTemplate("code")).toBe("Code Violation");
  });

  it("returns null for templates that serve many or no record types", () => {
    // The maintained Distress Feed serves every type — nothing to pre-fill.
    expect(defaultRecordTypeLabelForTemplate("distress-feed")).toBeNull();
    expect(defaultRecordTypeLabelForTemplate(null)).toBeNull();
    expect(defaultRecordTypeLabelForTemplate("linkedin")).toBeNull();
  });
});

describe("detectRecordType", () => {
  it("reads a plainly-named filing out of operator text", () => {
    // The reported bug: this text left Source stuck on "Waiting On You".
    expect(detectRecordType("Tax Lien leads for Pasco")).toBe("Tax Default / Delinquency");
    expect(detectRecordType("probate leads in hillsborough")).toBe("Probate");
    expect(detectRecordType("pre-foreclosures in tampa")).toBe("Pre-Foreclosure / Lis Pendens");
    expect(detectRecordType("code violation list, orange county")).toBe("Code Violation");
    expect(detectRecordType("surplus funds for FL")).toBe("Surplus Funds / Excess Proceeds");
  });

  it("ignores business scrapes and bare geography", () => {
    expect(detectRecordType("roofing companies in Hillsborough")).toBeNull();
    expect(detectRecordType("leads for Pasco County")).toBeNull();
    expect(detectRecordType("")).toBeNull();
    expect(detectRecordType(null)).toBeNull();
  });
});
