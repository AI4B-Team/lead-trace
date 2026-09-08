import { describe, expect, it } from "vitest";
import { FL_COUNTY_FIPS } from "./fl-counties";
import { MVP_COUNTY_ROSTER, PRIORITY_COUNTIES, rosterEntriesFor } from "./us-counties";

describe("MVP county roster", () => {
  it("puts the operator's priority trio at the very front, in order", () => {
    expect(MVP_COUNTY_ROSTER.slice(0, 3).map((c) => c.county)).toEqual([
      "Hillsborough",
      "Pasco",
      "Pinellas",
    ]);
    expect(PRIORITY_COUNTIES.every((c) => c.state === "FL")).toBe(true);
  });

  it("keeps all 67 FL counties (statewide promise intact)", () => {
    const fl = MVP_COUNTY_ROSTER.filter((c) => c.state === "FL");
    expect(fl.length).toBe(Object.keys(FL_COUNTY_FIPS).length);
    const fips = new Set(fl.map((c) => c.fips));
    for (const f of Object.values(FL_COUNTY_FIPS)) expect(fips.has(f)).toBe(true);
  });

  it("stays inside the MVP refresh budget (130-150 counties)", () => {
    expect(MVP_COUNTY_ROSTER.length).toBeGreaterThanOrEqual(130);
    expect(MVP_COUNTY_ROSTER.length).toBeLessThanOrEqual(150);
  });

  it("has no duplicate FIPS and every entry fully keyed", () => {
    const seen = new Set<string>();
    for (const c of MVP_COUNTY_ROSTER) {
      expect(c.state).toMatch(/^[A-Z]{2}$/);
      expect(c.county.length).toBeGreaterThan(0);
      expect(c.fips).toMatch(/^\d{5}$/);
      expect(seen.has(c.fips)).toBe(false);
      seen.add(c.fips);
    }
  });

  it("covers only the territory-verified expansion states", () => {
    const states = new Set(MVP_COUNTY_ROSTER.map((c) => c.state));
    expect([...states].sort()).toEqual(["AZ", "CA", "FL", "GA", "NC", "OH", "TX"]);
  });
});

describe("rosterEntriesFor (explicit county requests)", () => {
  it("resolves bare FL names exactly as the FL-only era did", () => {
    const hits = rosterEntriesFor(["Hillsborough", "Pasco"]);
    expect(hits.map((h) => h.fips)).toEqual(["12057", "12101"]);
    expect(hits.every((h) => h.state === "FL")).toBe(true);
  });

  it("disambiguates duplicate county names with an explicit state", () => {
    // Orange exists in both FL and CA; bare name must prefer FL.
    expect(rosterEntriesFor(["Orange"])[0]).toMatchObject({ state: "FL", fips: "12095" });
    expect(rosterEntriesFor(["Orange, CA"])[0]).toMatchObject({ state: "CA", fips: "06059" });
    // Forsyth exists in GA and NC — the state suffix decides.
    expect(rosterEntriesFor(["Forsyth, NC"])[0]).toMatchObject({ state: "NC", fips: "37067" });
    expect(rosterEntriesFor(["Forsyth, GA"])[0]).toMatchObject({ state: "GA", fips: "13117" });
  });

  it("ignores unknown names and dedupes repeats", () => {
    const hits = rosterEntriesFor(["Narnia", "Harris, TX", "harris, tx"]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ state: "TX", fips: "48201" });
  });
});
