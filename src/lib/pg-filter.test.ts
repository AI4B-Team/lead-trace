import { describe, expect, it } from "vitest";
import { pgFilterValue, pgIlikePattern } from "./pg-filter";

describe("postgrest filter escaping", () => {
  it("quotes commas and parentheses so they are not read as filter syntax", () => {
    expect(pgIlikePattern("Smith, John")).toBe('"%Smith, John%"');
    expect(pgIlikePattern("Acme (FL)")).toBe('"%Acme (FL)%"');
  });

  it("escapes embedded quotes and backslashes", () => {
    expect(pgFilterValue('a"b')).toBe('"a\\"b"');
    expect(pgFilterValue("a\\b")).toBe('"a\\\\b"');
  });
});
