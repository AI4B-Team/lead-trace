/**
 * Surplus Funds / Excess Proceeds — derived, not scraped.
 *
 * Surplus is the gap between what a property SOLD for at auction and what was
 * owed going in. The RealAuction adapter already visits both auction domains,
 * so phase 1 derives surplus from completed sale rows rather than adding a
 * scraper. Phase 2 (not in this pass) reads the clerk's official surplus /
 * unclaimed-funds list, which is the only source of a confirmed amount and a
 * claim deadline.
 *
 * Hard rule: a missing sold amount means UNKNOWN. No estimate, no inference,
 * no default. Those rows are counted as a data gap instead.
 */

export type SurplusBasis = "final_judgment" | "opening_bid";

export type SurplusInput = {
  /** Mapped adapter fields, as strings (RawFiling.raw carries them verbatim). */
  soldAmount?: string | number | null;
  soldTo?: string | null;
  soldDate?: string | null;
  finalJudgmentAmount?: string | number | null;
  openingBid?: string | number | null;
};

export type SurplusResult = {
  surplusAmount: number;
  surplusBasis: SurplusBasis;
  soldTo: string;
  soldDate: string | null;
  /** Always true in phase 1: computed from auction results, not the clerk. */
  estimated: true;
};

export type SurplusCounters = {
  /** Auction rows considered. */
  auctions: number;
  /** Rows whose sold-to indicates a third-party bidder. */
  soldToThirdParty: number;
  /** Rows with sold amount above the applicable baseline. */
  aboveBaseline: number;
  /** Records actually produced. */
  created: number;
  /** Rows the county's pages did not expose a sold amount for. */
  soldAmountUnavailable: number;
};

export const EMPTY_SURPLUS_COUNTERS: SurplusCounters = {
  auctions: 0,
  soldToThirdParty: 0,
  aboveBaseline: 0,
  created: 0,
  soldAmountUnavailable: 0,
};

/** The basis each auction domain measures surplus against. */
export function surplusBasisForDomain(domain: string): SurplusBasis {
  return domain.includes("realtaxdeed") ? "opening_bid" : "final_judgment";
}

function money(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A plaintiff/lender taking the property back is not a surplus event — the
 * debt is simply satisfied. Only an outside bidder overpaying creates funds a
 * former owner can claim.
 */
export function isThirdPartyBidder(soldTo: string | null | undefined): boolean {
  const v = (soldTo ?? "").toLowerCase();
  if (!v) return false;
  if (/plaintiff|certificate\s*holder|applicant|county|no\s*(bid|sale)|cancel/.test(v)) return false;
  return /3rd|third\s*party|outside|bidder/.test(v);
}

/** Null when this row is not a surplus event, or when the amount is unknown. */
export function deriveSurplus(input: SurplusInput, basis: SurplusBasis): SurplusResult | null {
  if (!isThirdPartyBidder(input.soldTo)) return null;
  const sold = money(input.soldAmount);
  if (sold == null) return null; // unknown, not zero
  const baseline =
    basis === "opening_bid" ? money(input.openingBid) : money(input.finalJudgmentAmount);
  if (baseline == null) return null;
  const surplus = Math.round((sold - baseline) * 100) / 100;
  if (surplus <= 0) return null;
  return {
    surplusAmount: surplus,
    surplusBasis: basis,
    soldTo: String(input.soldTo).trim(),
    soldDate: input.soldDate ?? null,
    estimated: true,
  };
}

export function surplusBasisLabel(basis: string | null | undefined): string {
  return basis === "opening_bid" ? "Opening Bid" : "Final Judgment";
}

// ---------------------------------------------------------------------------
// State-level compliance notice. Informational only — nothing is gated on it.
// ---------------------------------------------------------------------------

export const SURPLUS_NOTICE_DEFAULT =
  "Surplus recovery is regulated at the state level. Many states cap recovery fees and some require registration or licensing to act as a finder. Verify your state's rules before contacting claimants.";

const SURPLUS_NOTICE_BY_STATE: Record<string, string> = {
  FL: `${SURPLUS_NOTICE_DEFAULT} In Florida, Fla. Stat. 45.033 caps the fee a surplus claim assignee may collect at 12% of the surplus.`,
};

export function surplusNoticeForState(state: string | null | undefined): string {
  const key = (state ?? "").trim().toUpperCase();
  return SURPLUS_NOTICE_BY_STATE[key] ?? SURPLUS_NOTICE_DEFAULT;
}

/**
 * Counties where surplus derivation is enabled. Only counties with verified
 * live 'records' coverage in county_coverage are listed; nothing speculative.
 */
export const SURPLUS_PROOF_COUNTIES: ReadonlyArray<{ state: string; county: string }> = [
  { state: "FL", county: "Hillsborough" },
  { state: "FL", county: "Pasco" },
  { state: "FL", county: "Pinellas" },
  { state: "FL", county: "Polk" },
];

export function surplusEnabledFor(state: string, county: string): boolean {
  return SURPLUS_PROOF_COUNTIES.some(
    (c) =>
      c.state.toLowerCase() === state.trim().toLowerCase() &&
      c.county.toLowerCase() === county.trim().toLowerCase(),
  );
}
