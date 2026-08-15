// The manual-mapping recovery path: when a returned agency spreadsheet uses
// headers nothing can infer, a human's map must still produce usable leads.
import { describe, expect, it } from "vitest";
import { inferFieldMap, isUsableMap, normalizeRows, type FieldMap } from "./source-mapping";
import { csvToRecords } from "./bulk-file";

const OPAQUE_CSV = [
  "F1,F2,F3,F4,F5",
  "123 Main St,Ocala,34470,SMITH JOHN,2026-07-01",
  "9 Oak Ave,Ocala,34471,DOE JANE,2026-07-05",
].join("\n");

describe("manual column mapping recovery", () => {
  const rows = csvToRecords(OPAQUE_CSV);

  it("cannot infer a usable map from opaque headers", () => {
    expect(isUsableMap(inferFieldMap(Object.keys(rows[0]!)))).toBe(false);
  });

  it("normalizes rows once a human supplies the map", () => {
    const map: FieldMap = { address: "F1", city: "F2", zip: "F3", owner: "F4", case_date: "F5" };
    expect(isUsableMap(map)).toBe(true);
    const leads = normalizeRows(rows, map, {
      recordType: "surplus_funds",
      county: "Marion, FL",
      state: "FL",
      provider: "Marion Clerk (Public Records Request)",
      casePrefix: "PRR",
    });
    expect(leads).toHaveLength(2);
    expect(leads[0]!.address).toBe("123 Main St");
    expect(leads[0]!.city).toBe("Ocala");
    expect(leads[0]!.zip).toBe("34470");
    expect(leads[0]!.full_name).toBeTruthy();
  });
});
