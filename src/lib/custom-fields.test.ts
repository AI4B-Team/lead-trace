import { describe, expect, it } from "vitest";
import { aggregateFields, classifyFieldKey, resultFieldsForTemplate } from "@/lib/lead-fields";

const countyRows = [
  {
    full_name: "Jane Owner",
    source_meta: { parcel_id: "12-345-678", tax_amount: "4210", mailing_address: "5 Oak St" },
  },
];

describe("custom scrape fields", () => {
  it("renders a custom scrape's own fields with no template code", () => {
    const fields = resultFieldsForTemplate("county-portal-xyz", countyRows);
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("parcel_id");
    expect(keys).toContain("tax_amount");
    // mailing_* keys are internal distress/surplus plumbing — the registry's
    // address field covers them, so discovery must not render a raw copy.
    expect(keys).not.toContain("mailing_address");
    expect(classifyFieldKey("mailing_address").channel).toBe("address");
    expect(fields.find((f) => f.key === "parcel_id")?.kind).toBe("display");
    expect(fields.find((f) => f.key === "parcel_id")?.label).toBe("Parcel Id");
    expect(fields.find((f) => f.key === "parcel_id")?.value(countyRows[0]!)).toBe("12-345-678");
  });

  it("prefers a declared output schema", () => {
    const fields = resultFieldsForTemplate("county-portal-xyz", [], [
      { key: "parcel_id", label: "Parcel ID" },
      { key: "tax_amount", label: "Tax Due", type: "display" },
    ]);
    expect(fields.find((f) => f.key === "parcel_id")?.label).toBe("Parcel ID");
  });

  it("surfaces novel fields on the leads aggregate only when present", () => {
    expect(aggregateFields(countyRows).map((f) => f.key)).toContain("tax_amount");
    expect(aggregateFields([{ phone: "555" }]).map((f) => f.key)).not.toContain("tax_amount");
  });

  it("classifies channels minimally, websites stay display", () => {
    expect(classifyFieldKey("owner_phone").channel).toBe("phone");
    expect(classifyFieldKey("contact_email").channel).toBe("email");
    expect(classifyFieldKey("company_website").kind).toBe("display");
    expect(classifyFieldKey("permit_number").kind).toBe("display");
  });
});
