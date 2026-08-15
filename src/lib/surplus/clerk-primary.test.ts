import { describe, expect, it } from "vitest";
import { clerkRowToFiling, pickLatestPdf } from "./clerk-primary.server";
import type { ClerkSurplusRow } from "./handlers";

/**
 * clerkRowToFiling is the whole correctness surface of the clerk-primary path:
 * it decides which clerk rows become confirmed surplus_funds records and how
 * their fields land in distress_records. The DB-writing wrapper around it is
 * exercised in a live smoke test, not here.
 */

const CTX = {
  fips: "fl-marion",
  state: "FL",
  county: "Marion",
  saleKind: "tax_deed",
  sourceUrl: "https://example.gov/marion-surplus.pdf",
};

function row(over: Partial<ClerkSurplusRow> = {}): ClerkSurplusRow {
  return {
    case_number: "295336",
    parcel_apn: "1814-026-017",
    property_address: null,
    confirmed_amount: 5778.69,
    sale_date: "2022-08-17",
    claim_deadline: null,
    claim_status: "unclaimed",
    claimant_name: null,
    raw: { tax_number: "83442014" },
    ...over,
  };
}

describe("clerkRowToFiling", () => {
  it("maps a clerk row to a confirmed, non-estimated surplus filing", () => {
    const f = clerkRowToFiling(row(), CTX);
    expect(f).not.toBeNull();
    expect(f!.doc_number).toBe("SURP-fl-marion-295336");
    expect(f!.surplus_amount).toBe(5778.69);
    expect(f!.amount).toBe(5778.69);
    // tax_deed → opening_bid, so the public view maps sale_type to 'tax_deed'.
    expect(f!.surplus_basis).toBe("opening_bid");
    // The whole point of the clerk path: a confirmed figure, never estimated.
    expect(f!.estimated).toBe(false);
    expect(f!.auction_date).toBe("2022-08-17");
    expect(f!.parcel_apn).toBe("1814-026-017");
    expect(f!.sold_to).toBeNull();
    expect(f!.raw?.["clerk_confirmed"]).toBe(true);
  });

  it("produces NOTHING when the amount is missing or non-positive", () => {
    expect(clerkRowToFiling(row({ confirmed_amount: null }), CTX)).toBeNull();
    expect(clerkRowToFiling(row({ confirmed_amount: 0 }), CTX)).toBeNull();
    expect(clerkRowToFiling(row({ confirmed_amount: -5 }), CTX)).toBeNull();
  });

  it("reads a surname-first clerk name in the right order (Athens-Clarke GA)", () => {
    const f = clerkRowToFiling(row({ claimant_name: "Halliday, Katie" }), CTX);
    expect(f!.owner_first).toBe("Katie");
    expect(f!.owner_last).toBe("Halliday");
    // A suffix comma is punctuation, not a second name boundary.
    const suffixed = clerkRowToFiling(row({ claimant_name: "Walton, Wilbur, Jr" }), CTX);
    expect(suffixed!.owner_first).toBe("Wilbur");
    expect(suffixed!.owner_last).toBe("Walton");
    // Entities still go to company_entity untouched.
    const entity = clerkRowToFiling(row({ claimant_name: "Red Oak Development, Inc" }), CTX);
    expect(entity!.company_entity).toBe("Red Oak Development, Inc");
    expect(entity!.owner_first).toBeNull();
  });

  it("uses final_judgment basis for foreclosure sales", () => {
    const f = clerkRowToFiling(row(), { ...CTX, saleKind: "foreclosure" });
    expect(f!.surplus_basis).toBe("final_judgment");
  });

  it("falls back to parcel+sale date, then date+address, for a stable doc_number", () => {
    const byParcel = clerkRowToFiling(row({ case_number: null }), CTX);
    expect(byParcel!.doc_number).toBe("SURP-fl-marion-1814-026-017|2022-08-17");

    const byAddr = clerkRowToFiling(
      row({
        case_number: null,
        parcel_apn: null,
        property_address: "12 Oak St",
        sale_date: "2024-01-02",
      }),
      CTX,
    );
    expect(byAddr!.doc_number).toBe("SURP-fl-marion-2024-01-02|12 OAK ST");
  });

  it("keeps two sales of the SAME parcel as two records", () => {
    // Forsyth GA parcel 263 147 went to tax sale in 2021 and again in 2023, each
    // with its own surplus. Keying on the parcel alone silently dropped one.
    const first = clerkRowToFiling(
      row({ case_number: null, parcel_apn: "263 147", sale_date: "2021-06-01", confirmed_amount: 403.61 }),
      CTX,
    );
    const second = clerkRowToFiling(
      row({ case_number: null, parcel_apn: "263 147", sale_date: "2023-06-06", confirmed_amount: 1964.35 }),
      CTX,
    );
    expect(first!.doc_number).not.toBe(second!.doc_number);
  });

  it("carries no owner name (clerk lists omit it) without treating that as a gap", () => {
    const f = clerkRowToFiling(row(), CTX);
    expect(f!.owner_first).toBeNull();
    expect(f!.owner_last).toBeNull();
    expect(f!.company_entity).toBeNull();
  });
});

describe("pickLatestPdf (latest-PDF resolver)", () => {
  const LANDING =
    "https://www.marioncountyclerk.org/departments/records-recording/tax-deeds-and-lands-available-for-taxes/unclaimed-funds/";

  const html = `
    <a href="/uploads/2024/12/Surplus-claim-form-PDF.pdf">Claim form</a>
    <a href="/uploads/2026/03/1-BCC-Unclaimed-03-19-26.pdf">Unclaimed checks</a>
    <a href="/uploads/2026/06/Copy-of-Tax-Deeds-Surplus-Funds-2026-06-05.pdf">June surplus</a>
    <a href="/uploads/2026/08/Copy-of-Tax-Deeds-Surplus-Funds-2026-08-07.pdf">August surplus</a>
    <a href="/some/other/document.pdf">Unrelated</a>
  `;

  it("picks the newest dated surplus PDF as an absolute URL", () => {
    const url = pickLatestPdf(html, LANDING, "surplus");
    expect(url).toBe(
      "https://www.marioncountyclerk.org/uploads/2026/08/Copy-of-Tax-Deeds-Surplus-Funds-2026-08-07.pdf",
    );
  });

  it("ignores PDFs that do not match the linkMatch term", () => {
    // Only the claim FORM matches 'surplus' by name here; the dated report wins
    // over it because it has a later embedded date.
    const url = pickLatestPdf(html, LANDING, "surplus");
    expect(url).not.toContain("claim-form");
    expect(url).not.toContain("document.pdf");
  });

  it("returns null when nothing matches", () => {
    expect(pickLatestPdf(`<a href="/x/report.pdf">x</a>`, LANDING, "surplus")).toBeNull();
    expect(pickLatestPdf(`<p>no links here</p>`, LANDING)).toBeNull();
  });

  it("resolves the newest even when the newer file appears first in the HTML", () => {
    const reordered = `
      <a href="/uploads/2026/08/Tax-Deeds-Surplus-Funds-2026-08-07.pdf">Aug</a>
      <a href="/uploads/2026/09/Tax-Deeds-Surplus-Funds-2026-09-04.pdf">Sep</a>
    `;
    expect(pickLatestPdf(reordered, LANDING, "surplus")).toContain("2026-09-04");
  });
});
