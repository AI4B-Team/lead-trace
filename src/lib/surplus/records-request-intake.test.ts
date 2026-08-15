import { describe, expect, it } from "vitest";
import { inferSurplusColumnMap, isUsableSurplusMap, matrixToRecords } from "./records-request-intake";
import { toClerkRow } from "./handlers";

describe("inferSurplusColumnMap", () => {
  it("maps the wording clerks actually use", () => {
    const map = inferSurplusColumnMap(["Case Number", "Parcel ID", "Property Address", "Surplus Amount", "Sale Date"]);
    expect(map).toEqual({
      "Case Number": "case_number",
      "Parcel ID": "parcel_apn",
      "Property Address": "property_address",
      "Surplus Amount": "confirmed_amount",
      "Sale Date": "sale_date",
    });
    expect(isUsableSurplusMap(map)).toBe(true);
  });

  it("never reads opening bid or amount owed as the surplus", () => {
    const map = inferSurplusColumnMap(["Case No.", "Opening Bid", "Amount Owed"]);
    expect(Object.values(map)).not.toContain("confirmed_amount");
    expect(isUsableSurplusMap(map)).toBe(false);
  });

  it("needs an identifier as well as an amount", () => {
    expect(isUsableSurplusMap(inferSurplusColumnMap(["Balance"]))).toBe(false);
    expect(isUsableSurplusMap(inferSurplusColumnMap(["Balance", "Folio"]))).toBe(true);
    expect(isUsableSurplusMap(inferSurplusColumnMap(["Excess Funds", "Situs", "Date of Sale"]))).toBe(true);
  });
});

describe("matrixToRecords", () => {
  it("skips a clerk as-of note above the real header row", () => {
    const rows = matrixToRecords([
      ["Unclaimed Tax Deed Surplus as of 08/01/2026", "", ""],
      ["Case Number", "Parcel ID", "Surplus Amount"],
      ["2024-TD-11", "12-34-56", "$4,210.00"],
      ["", "", ""],
    ]);
    expect(rows).toHaveLength(1);
    const row = toClerkRow(rows[0]!, inferSurplusColumnMap(Object.keys(rows[0]!)));
    expect(row?.confirmed_amount).toBe(4210);
    expect(row?.case_number).toBe("2024-TD-11");
  });
});