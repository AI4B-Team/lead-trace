import { describe, expect, it } from "vitest";
import { SOURCE_CLASS_RANK } from "../distress/reconcile.shared";
import {
  REALEFLOW_LEAD_CONFIGS,
  buildSearchBody,
  docNumberFor,
  isEntitlementError,
  isMailingOptedOut,
  propertyToFiling,
  sliceCounties,
} from "./realeflow-source.shared";

const probate = REALEFLOW_LEAD_CONFIGS.find((c) => c.recordType === "probate")!;
const vacancy = REALEFLOW_LEAD_CONFIGS.find((c) => c.recordType === "vacancy")!;
const preFc = REALEFLOW_LEAD_CONFIGS.find((c) => c.recordType === "pre_foreclosure")!;

const splitOwner = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null, entity: null };
  return { first: parts[0]!, last: parts[parts.length - 1]!, entity: null };
};

describe("filter config → request body", () => {
  it("anchors on the county FIPS and carries the proven filter", () => {
    expect(buildSearchBody({ fips: "12057", config: probate, pageSize: 20 })).toEqual({
      places: [{ state: "FL", fips: 12057 }],
      page: 1,
      page_size: 20,
      lienTypes: ["DECEASED_PROBATE"],
    });
  });

  it("passes leadTypes include lists through untouched", () => {
    expect(buildSearchBody({ fips: "12086", config: vacancy, page: 2 }).leadTypes).toEqual({
      include: ["ZOMBIE_PROPERTY", "VACANCY"],
    });
  });

  it("keeps entitlement-gated types configured but off", () => {
    expect(preFc.enabled).toBe(false);
    expect(preFc.filter.leadTypes).toEqual({ include: ["PRE_FORECLOSURE"] });
  });
});

describe("entitlement handling", () => {
  it("treats a 400 'not available on this account' as an entitlement state", () => {
    expect(
      isEntitlementError(400, "Realeflow 400: PRE_FORECLOSURE not available on this account"),
    ).toBe(true);
  });

  it("does not swallow ordinary failures", () => {
    expect(isEntitlementError(400, "invalid places[]")).toBe(false);
    expect(isEntitlementError(500, "not available on this account")).toBe(false);
  });
});

describe("doc_number derivation", () => {
  it("namespaces the stable address hash by record type", () => {
    expect(docNumberFor(probate, { address_hash: "abc123" })).toBe("PRB-abc123");
    expect(docNumberFor(vacancy, { address_hash: "abc123" })).toBe("VAC-abc123");
  });

  it("falls back to the normalized address when no hash is returned", () => {
    expect(
      docNumberFor(probate, {
        address_number: "15125",
        address_street: "DAUGHTRY LN",
        address_zip: "33610",
      }),
    ).toBe("PRB-15125 DAUGHTRY LN|33610");
  });

  it("skips a row with nothing stable to key on", () => {
    expect(docNumberFor(probate, {})).toBeNull();
    expect(propertyToFiling(probate, "Hillsborough", {}, splitOwner)).toBeNull();
  });

  it("honours mailing opt-out", () => {
    expect(isMailingOptedOut({ mailing_opt_out: true } as never)).toBe(true);
    expect(isMailingOptedOut({ address_hash: "x" })).toBe(false);
  });
});

describe("source precedence", () => {
  it("ranks a licensed API above open data", () => {
    expect(SOURCE_CLASS_RANK.licensed_api).toBeGreaterThan(SOURCE_CLASS_RANK.open_data);
  });

  it("still lets the clerk win over the vendor feed", () => {
    expect(SOURCE_CLASS_RANK.clerk_records).toBeGreaterThan(SOURCE_CLASS_RANK.licensed_api);
  });

  it("tags rows with the licensed source class", () => {
    const filing = propertyToFiling(
      probate,
      "Hillsborough",
      {
        address_hash: "h1",
        address_number: "902",
        address_street: "21ST ST SE",
        owner_std_name1_full: "JOHN SMITH",
      },
      splitOwner,
    )!;
    expect(filing.raw["source_class"]).toBe("licensed_api");
    expect(filing.property_address).toBe("902 21ST ST SE");
  });
});
describe("resumable county slicing", () => {
  const counties = ["a", "b", "c", "d", "e"];

  it("resumes from the stored cursor", () => {
    expect(sliceCounties({ counties, cursor: 2, maxCounties: 2 })).toEqual({
      slice: ["c", "d"],
      nextCursor: 4,
      wrapped: false,
    });
  });

  it("respects the slice bound", () => {
    expect(sliceCounties({ counties, cursor: 0, maxCounties: 3 }).slice).toHaveLength(3);
  });

  it("wraps to the start once the list is covered", () => {
    const last = sliceCounties({ counties, cursor: 4, maxCounties: 2 });
    expect(last.slice).toEqual(["e"]);
    expect(last.wrapped).toBe(true);
    expect(last.nextCursor).toBe(0);
  });

  it("restarts rather than skipping when the cursor is past the end", () => {
    expect(sliceCounties({ counties, cursor: 11, maxCounties: 2 }).slice).toEqual(["b", "c"]);
  });

  it("covers every county over successive ticks", () => {
    const seen: string[] = [];
    let cursor = 0;
    for (let tick = 0; tick < 3; tick += 1) {
      const s = sliceCounties({ counties, cursor, maxCounties: 2 });
      seen.push(...s.slice);
      cursor = s.nextCursor;
    }
    expect(seen).toEqual(counties);
    expect(cursor).toBe(0);
  });
});
