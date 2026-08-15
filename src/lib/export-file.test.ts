import { describe, expect, it } from "vitest";
import { toCsv } from "./export-file";

describe("toCsv", () => {
  it("uses the union of keys across rows", () => {
    const csv = toCsv([{ name: "A" }, { name: "B", phone: "555" }]);
    expect(csv.split("\n")[0]).toBe("name,phone");
    expect(csv.split("\n")[2]).toBe("B,555");
  });

  it("quotes values with commas, quotes and newlines", () => {
    const csv = toCsv([{ a: 'Smith, "Jack"', b: "l1\r\nl2" }]);
    expect(csv).toContain('"Smith, ""Jack"""');
    expect(csv).toContain('"l1\r\nl2"');
  });

  it("returns empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});
