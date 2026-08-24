import { describe, expect, it } from "vitest";
import { dedupeFeedRows } from "./distress-feed.shared";

type Row = {
  fips: string;
  record_type: string;
  doc_number: string;
  parcel_apn?: string | null;
  tag?: string;
};

const row = (over: Partial<Row>): Row => ({
  fips: "fl-bradford",
  record_type: "vacancy",
  doc_number: "VAC-a",
  parcel_apn: null,
  ...over,
});

describe("dedupeFeedRows", () => {
  it("collapses exact (fips, record_type, doc_number) duplicates, keeping the last", () => {
    const out = dedupeFeedRows([
      row({ doc_number: "VAC-a", tag: "first" }),
      row({ doc_number: "VAC-a", tag: "second" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.tag).toBe("second");
  });

  it("collapses the same parcel under two lead-type doc_numbers (the vacancy bug)", () => {
    // ZOMBIE_PROPERTY and VACANCY return the same physical property with two
    // different address hashes, so two doc_numbers share one parcel_apn. Before
    // the fix these two rows reached one upsert statement and Postgres rejected
    // the whole batch on the (fips, parcel_apn) unique index.
    const out = dedupeFeedRows([
      row({ doc_number: "VAC-zombie", parcel_apn: "P-100", tag: "zombie" }),
      row({ doc_number: "VAC-vacant", parcel_apn: "P-100", tag: "vacant" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.parcel_apn).toBe("P-100");
    expect(out[0]!.tag).toBe("vacant"); // last sighting wins
  });

  it("never collapses rows that share a parcel across different record types", () => {
    const out = dedupeFeedRows([
      row({ record_type: "vacancy", doc_number: "VAC-a", parcel_apn: "P-1" }),
      row({ record_type: "probate", doc_number: "PRB-a", parcel_apn: "P-1" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("keeps every parcel-less row (nothing to collide on)", () => {
    const out = dedupeFeedRows([
      row({ doc_number: "VAC-a", parcel_apn: null }),
      row({ doc_number: "VAC-b", parcel_apn: null }),
      row({ doc_number: "VAC-c", parcel_apn: undefined }),
    ]);
    expect(out).toHaveLength(3);
  });

  it("keeps distinct parcels and is order-preserving for pass-through rows", () => {
    const out = dedupeFeedRows([
      row({ doc_number: "VAC-a", parcel_apn: null, tag: "n1" }),
      row({ doc_number: "VAC-b", parcel_apn: "P-1", tag: "p1" }),
      row({ doc_number: "VAC-c", parcel_apn: "P-2", tag: "p2" }),
    ]);
    expect(out).toHaveLength(3);
    // parcel-less rows come first, in original order, then the parcel rows.
    expect(out[0]!.tag).toBe("n1");
    expect(out.map((r) => r.tag).sort()).toEqual(["n1", "p1", "p2"]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeFeedRows([])).toEqual([]);
  });
});
