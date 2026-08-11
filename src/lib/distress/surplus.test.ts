import { describe, expect, it } from "vitest";
import { buildSurplusFunnel, funnelViolations } from "../funnel-math";
import { DISCOVERY_RECORD_TYPES, DISCOVERY_KEYWORDS } from "../data-providers/source-mapping";
import { RECORD_TYPE_SLUGS, recordTypeDisplayName, recordTypeId } from "../record-types";
import { deriveSurplus, isThirdPartyBidder, surplusBasisForDomain, surplusEnabledFor, surplusNoticeForState } from "./surplus";

describe("record type slugs are the only join key", () => {
  it("discovery types are all real record_types slugs", () => {
    for (const slug of DISCOVERY_RECORD_TYPES) expect(RECORD_TYPE_SLUGS).toContain(slug);
  });
  it("keywords are keyed by slug", () => {
    for (const slug of DISCOVERY_RECORD_TYPES) expect(DISCOVERY_KEYWORDS[slug].length).toBeGreaterThan(0);
  });
  it("word-order variants resolve to the same slug", () => {
    expect(recordTypeId("Lis Pendens / Pre-Foreclosure")).toBe("pre_foreclosure");
    expect(recordTypeId("Pre-Foreclosure / Lis Pendens")).toBe("pre_foreclosure");
    expect(recordTypeId("Demolition")).toBe("vacancy");
  });
  it("display names come from one place", () => {
    expect(recordTypeDisplayName("surplus_funds")).toBe("Surplus Funds / Excess Proceeds");
    expect(recordTypeDisplayName("surplus_funds", [{ slug: "surplus_funds", name: "Surplus" }])).toBe("Surplus");
  });
});

describe("surplus derivation", () => {
  const fc = { finalJudgmentAmount: "$100,000.00", openingBid: "$50,000.00", soldTo: "3rd Party Bidder" };

  it("uses final judgment for foreclosure and opening bid for tax deed", () => {
    expect(surplusBasisForDomain("hillsborough.realforeclose.com")).toBe("final_judgment");
    expect(surplusBasisForDomain("polk.realtaxdeed.com")).toBe("opening_bid");
    expect(deriveSurplus({ ...fc, soldAmount: "$160,000.00" }, "final_judgment")?.surplusAmount).toBe(60000);
    expect(deriveSurplus({ ...fc, soldAmount: "$160,000.00" }, "opening_bid")?.surplusAmount).toBe(110000);
  });

  it("produces nothing when the sold amount is unknown — never zero, never estimated", () => {
    expect(deriveSurplus({ ...fc, soldAmount: null }, "final_judgment")).toBeNull();
    expect(deriveSurplus({ ...fc, soldAmount: "" }, "final_judgment")).toBeNull();
  });

  it("ignores plaintiff takebacks", () => {
    expect(isThirdPartyBidder("Plaintiff")).toBe(false);
    expect(isThirdPartyBidder("Certificate Holder")).toBe(false);
    expect(isThirdPartyBidder("3rd Party Bidder")).toBe(true);
    expect(deriveSurplus({ ...fc, soldTo: "Plaintiff", soldAmount: "$160,000" }, "final_judgment")).toBeNull();
  });

  it("requires a positive surplus", () => {
    expect(deriveSurplus({ ...fc, soldAmount: "$100,000" }, "final_judgment")).toBeNull();
    expect(deriveSurplus({ ...fc, soldAmount: "$90,000" }, "final_judgment")).toBeNull();
  });

  it("always marks the figure estimated", () => {
    expect(deriveSurplus({ ...fc, soldAmount: "$160,000" }, "final_judgment")?.estimated).toBe(true);
  });

  it("only the four verified proof counties are enabled", () => {
    for (const c of ["Hillsborough", "Pasco", "Pinellas", "Polk"]) {
      expect(surplusEnabledFor("FL", c)).toBe(true);
    }
    expect(surplusEnabledFor("FL", "Broward")).toBe(false);
    expect(surplusEnabledFor("IL", "Cook")).toBe(false);
  });

  it("notice is informational and state-aware", () => {
    expect(surplusNoticeForState("FL")).toContain("45.033");
    expect(surplusNoticeForState("TX")).toContain("regulated at the state level");
  });
});

describe("surplus funnel", () => {
  it("narrows and never passes through", () => {
    const stages = buildSurplusFunnel({
      auctions: 120, soldToThirdParty: 34, aboveBaseline: 21, created: 21, soldAmountUnavailable: 9,
    });
    expect(stages.map((s) => s.remaining)).toEqual([120, 34, 21, 21]);
    expect(funnelViolations(stages)).toEqual([]);
    expect(stages[1]!.delta).toBe("86 Removed");
  });

  it("surfaces a county with no published sold amounts as a data gap", () => {
    const stages = buildSurplusFunnel({
      auctions: 80, soldToThirdParty: 12, aboveBaseline: 0, created: 0, soldAmountUnavailable: 12,
    });
    expect(stages[3]!.remaining).toBe(0);
    expect(stages[1]!.annotation ?? stages[1]!.delta).toBeTruthy();
  });
});
