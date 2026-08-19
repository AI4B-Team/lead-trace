import { describe, expect, it } from "vitest";
import { distressRowToLead } from "./row-to-lead";

describe("distressRowToLead", () => {
  it("maps a probate row to a lead", () => {
    const lead = distressRowToLead({
      owner_first: "Jane",
      owner_last: "Doe",
      record_type: "probate",
      property_address: "123 Main St",
      property_city: "Tampa",
      property_state: "FL",
      property_zip: "33602",
      state: "FL",
    });
    expect(lead.full_name).toBe("Jane Doe");
    expect(lead.address).toBe("123 Main St");
    expect(lead.city).toBe("Tampa");
    expect(lead.state).toBe("FL");
    expect(lead.zip).toBe("33602");
    expect(lead.phone).toBeNull();
    expect((lead.source_meta as Record<string, unknown>).record_type).toBe("probate");
  });

  it("carries the held surplus balance through source_meta", () => {
    const lead = distressRowToLead({
      owner_last: "Smith",
      record_type: "surplus_funds",
      surplus_amount: 41250.5,
      surplus_basis: "clerk_published",
      state: "FL",
    });
    const meta = lead.source_meta as Record<string, unknown>;
    expect(lead.full_name).toBe("Smith");
    expect(meta.surplus_amount).toBe(41250.5);
    expect(meta.surplus_basis).toBe("clerk_published");
  });
});
