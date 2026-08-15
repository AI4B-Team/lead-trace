import { describe, expect, it } from "vitest";
import { isLikelyClaimForm, isLikelySurplusList, pickListDocuments } from "./doc-classify";

describe("surplus document classification", () => {
  it("rejects claim paperwork seen live on FL clerk sites", () => {
    for (const u of [
      "https://bay-co-clerk.s3.amazonaws.com/uploads/2026/03/Claim-to-Surplus-Proceeds_ada.pdf",
      "https://www.stlucieclerk.com/deptforms/finance/Unclaimed-Monies-Affidavit.pdf",
      "https://x.gov/surplus-claim-instructions.pdf",
      "https://x.gov/tax-deed-surplus-application.pdf",
    ]) {
      expect(isLikelyClaimForm(u), u).toBe(true);
      expect(isLikelySurplusList(u), u).toBe(false);
    }
  });

  it("accepts published lists", () => {
    for (const u of [
      "https://clayclerk.com/uploads/Unclaimed-Funds-List-Published-July-2026.pdf",
      "https://x.gov/files/tax-deed-surplus-report-2026.xlsx",
      "https://x.gov/held_surplus_balances.csv",
    ]) {
      expect(isLikelySurplusList(u), u).toBe(true);
    }
  });

  it("ignores documents unrelated to surplus", () => {
    expect(isLikelySurplusList("https://x.gov/budget-report-2026.pdf")).toBe(false);
  });

  it("prefers spreadsheets over PDFs", () => {
    const picked = pickListDocuments([
      "https://x.gov/unclaimed-funds-list-2026.pdf",
      "https://x.gov/tax-deed-surplus-list-2026.xlsx",
      "https://x.gov/claim-form.pdf",
    ]);
    expect(picked[0]).toContain(".xlsx");
    expect(picked).toHaveLength(2);
  });
});
