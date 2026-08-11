/**
 * Reconciliation — matching the clerk's confirmed number to the auction record
 * phase 1 already derived. This, not the scraping, is what people renew for.
 *
 * Both numbers are kept on the record forever. A systematic divergence for one
 * county almost always means that county's auction pages label something
 * differently than the RealAuction labelMap expects, so the variance flag
 * doubles as the only automated correctness check phase 1 has.
 */

export type MatchMethod = "case_number" | "parcel_apn" | "address_date" | "unmatched";

export type DerivedRecord = {
  id: string;
  doc_number: string | null;
  parcel_apn: string | null;
  property_address: string | null;
  auction_date: string | null;
  surplus_amount: number | null;
};

export type ConfirmationInput = {
  case_number?: string | null;
  parcel_apn?: string | null;
  property_address?: string | null;
  sale_date?: string | null;
  confirmed_amount?: number | null;
};

export type MatchResult = {
  derived: DerivedRecord | null;
  method: MatchMethod;
  fuzzy: boolean;
};

/** Percentage gap above which a match is flagged for human review. */
export const VARIANCE_REVIEW_THRESHOLD_PCT = 5;

/** Fuzzy address matching needs the sale dates to be within this many days. */
export const ADDRESS_MATCH_DAY_WINDOW = 3;

export function normalizeCaseNumber(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeApn(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const STREET_WORDS: Record<string, string> = {
  street: "st", str: "st", avenue: "ave", av: "ave", boulevard: "blvd", drive: "dr",
  road: "rd", lane: "ln", court: "ct", circle: "cir", place: "pl", terrace: "ter",
  parkway: "pkwy", highway: "hwy", trail: "trl", north: "n", south: "s", east: "e",
  west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  apartment: "unit", apt: "unit", suite: "unit", ste: "unit",
};

/** Collapse an address to a comparable token string. Empty when unusable. */
export function normalizeAddress(v: string | null | undefined): string {
  const raw = (v ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = raw
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => STREET_WORDS[t] ?? t);
  return tokens.join(" ").trim();
}

function daysApart(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const x = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const y = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.abs(Math.round((x - y) / 86_400_000));
}

/**
 * Match one confirmation against candidate derived records for the same county.
 * Tried in confidence order; the address path is last resort and flagged fuzzy.
 */
export function matchConfirmation(
  confirmation: ConfirmationInput,
  candidates: readonly DerivedRecord[],
): MatchResult {
  const caseKey = normalizeCaseNumber(confirmation.case_number);
  if (caseKey) {
    const hit = candidates.find((c) => normalizeCaseNumber(c.doc_number) === caseKey);
    if (hit) return { derived: hit, method: "case_number", fuzzy: false };
  }

  const apn = normalizeApn(confirmation.parcel_apn);
  if (apn) {
    const hit = candidates.find((c) => normalizeApn(c.parcel_apn) === apn);
    if (hit) return { derived: hit, method: "parcel_apn", fuzzy: false };
  }

  const addr = normalizeAddress(confirmation.property_address);
  if (addr && confirmation.sale_date) {
    const hit = candidates.find((c) => {
      if (normalizeAddress(c.property_address) !== addr) return false;
      const gap = daysApart(confirmation.sale_date, c.auction_date);
      return gap != null && gap <= ADDRESS_MATCH_DAY_WINDOW;
    });
    if (hit) return { derived: hit, method: "address_date", fuzzy: true };
  }

  return { derived: null, method: "unmatched", fuzzy: false };
}

/** Percentage the confirmed amount differs from the derived one. */
export function variancePct(derived: number | null, confirmed: number | null): number | null {
  if (derived == null || confirmed == null || derived <= 0) return null;
  return Math.abs((confirmed - derived) / derived) * 100;
}

export function needsVarianceReview(pct: number | null): boolean {
  return pct != null && pct > VARIANCE_REVIEW_THRESHOLD_PCT;
}

/** A confirmation is not customer-facing without an amount and a fetch time. */
export function isUsableConfirmation(c: ConfirmationInput & { confirmed_as_of?: string | null }): boolean {
  return Boolean(c.confirmed_as_of) && typeof c.confirmed_amount === "number" && c.confirmed_amount > 0;
}
