import { describe, expect, it } from "vitest";
import { aggregateFields } from "./lead-fields";

// The Leads master is data-driven: amount-driven lead types (surplus / distress)
// carry their facts in source_meta, and the aggregate must surface them as
// formatted columns without any per-source table code.
describe("aggregateFields — surplus / distress columns", () => {
  const surplusRow = {
    phone: null,
    email: null,
    address: "123 Main St",
    source_meta: {
      record_type: "surplus_funds",
      county: "Hillsborough",
      surplus_amount: "44003",
      sale_date: "2026-07-15",
      escheat_date: "2026-11-12",
      // Internal plumbing that must NOT become a column.
      fips: "12057",
      doc_number: "SURP-FL-123",
      surplus_basis: "clerk_published",
    },
  };

  it("promotes surplus facts to formatted registry columns", () => {
    const fields = aggregateFields([surplusRow]);
    const byKey = new Map(fields.map((f) => [f.key, f]));

    expect(byKey.has("surplus_amount")).toBe(true);
    expect(byKey.get("surplus_amount")?.format).toBe("currency");
    expect(byKey.get("sale_date")?.format).toBe("date");
    expect(byKey.get("escheat_date")?.format).toBe("escheat");
    expect(byKey.has("county")).toBe(true);
    expect(byKey.has("record_type")).toBe(true);

    // The registry value accessors read straight from source_meta.
    expect(byKey.get("surplus_amount")?.value(surplusRow)).toBe("44003");
    expect(byKey.get("sale_date")?.value(surplusRow)).toBe("2026-07-15");
  });

  it("never renders internal plumbing keys as columns", () => {
    const keys = aggregateFields([surplusRow]).map((f) => f.key);
    for (const noise of ["fips", "doc_number", "surplus_basis"]) {
      expect(keys).not.toContain(noise);
    }
  });

  it("omits amount columns when the view has none (no wall of dashes)", () => {
    const businessRow = {
      phone: "8135551234",
      email: "owner@shop.com",
      business_name: "Acme",
      source_meta: {},
    };
    const keys = aggregateFields([businessRow]).map((f) => f.key);
    expect(keys).not.toContain("surplus_amount");
    expect(keys).not.toContain("escheat_date");
    expect(keys).toContain("phone");
    expect(keys).toContain("email");
  });
});
