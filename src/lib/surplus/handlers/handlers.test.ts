import { describe, expect, it } from "vitest";
import { parseHtmlTable, pickTable, extractTables, extractRows, stripTags } from "./html-table";
import { parsePdfLines } from "./pdf-list";
import { parseClaimStatus, parseClerkDate, parseMoney, toClerkRow } from "./types";

const COLUMN_MAP = {
  "Case Number": "case_number",
  "Property Address": "property_address",
  "Surplus Amount": "confirmed_amount",
  "Sale Date": "sale_date",
  "Status": "claim_status",
};

const PAGE = `
<html><body>
<table><tr><td>Navigation</td></tr></table>
<table>
  <tr><th>Case Number</th><th>Property Address</th><th>Surplus Amount</th><th>Sale Date</th><th>Status</th></tr>
  <tr><td>2023-CA-001234</td><td>123 Main St</td><td>$45,120.55</td><td>3/14/2024</td><td>Unclaimed</td></tr>
  <tr><td>2023-CA-005678</td><td>9 Oak Ave</td><td>1200</td><td>2024-01-02</td><td>Claim Filed</td></tr>
  <tr><td>&nbsp;</td><td>no identifiers</td><td></td><td></td><td></td></tr>
</table>
</body></html>`;

describe("clerk cell parsing", () => {
  it("reads money as clerks print it and rejects junk", () => {
    expect(parseMoney("$45,120.55")).toBe(45120.55);
    expect(parseMoney("0.00")).toBeNull();
    expect(parseMoney("N/A")).toBeNull();
  });

  it("normalizes both clerk date styles", () => {
    expect(parseClerkDate("3/14/2024")).toBe("2024-03-14");
    expect(parseClerkDate("2024-01-02")).toBe("2024-01-02");
    expect(parseClerkDate("sometime")).toBeNull();
  });

  it("only maps claim words the clerk actually printed", () => {
    expect(parseClaimStatus("Unclaimed")).toBe("unclaimed");
    expect(parseClaimStatus("Disbursed 5/1")).toBe("disbursed");
    expect(parseClaimStatus("misc note")).toBe("unknown");
  });

  it("drops rows with neither identifier nor amount", () => {
    expect(toClerkRow({ "Case Number": "", "Surplus Amount": "" }, COLUMN_MAP)).toBeNull();
  });
});

describe("html_table handler", () => {
  it("picks the surplus table, not page furniture", () => {
    const tables = extractTables(PAGE);
    expect(tables).toHaveLength(2);
    expect(pickTable(tables, Object.keys(COLUMN_MAP))?.index).toBe(1);
  });

  it("parses rows and keeps raw cells", () => {
    const rows = parseHtmlTable(PAGE, COLUMN_MAP);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      case_number: "2023-CA-001234",
      confirmed_amount: 45120.55,
      sale_date: "2024-03-14",
      claim_status: "unclaimed",
      property_address: "123 Main St",
    });
    expect(rows[1]!.claim_status).toBe("claim_filed");
    expect(rows[0]!.raw["Sale Date"]).toBe("3/14/2024");
  });

  it("returns nothing when the configured columns are absent", () => {
    expect(parseHtmlTable(PAGE, { Nope: "case_number" })).toHaveLength(0);
  });

  it("strips markup and entities from cells", () => {
    expect(stripTags("<b>A&amp;B</b><br/>C")).toBe("A&B C");
    expect(extractRows("<table><tr><td>x</td><td>y</td></tr></table>")).toEqual([["x", "y"]]);
  });
});

describe("pdf_list handler", () => {
  const config = {
    columns: ["case_number", "property_address", "confirmed_amount"],
    rowPattern: "^(\\d{2}-\\d{6}-CA)\\s+(.+?)\\s+\\$([\\d,]+\\.\\d{2})$",
    skipLines: ["Page ", "Surplus Report"],
  };

  it("parses only lines matching the configured pattern", () => {
    const rows = parsePdfLines(
      [
        "Surplus Report March 2024",
        "23-001234-CA 55 Palm Dr $10,500.00",
        "Page 1 of 3",
        "footer noise",
      ],
      config,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ case_number: "23-001234-CA", confirmed_amount: 10500 });
  });

  it("refuses to guess when no row pattern is configured", () => {
    expect(parsePdfLines(["23-001234-CA 55 Palm Dr $10,500.00"], { columns: config.columns })).toHaveLength(0);
  });

  // Osceola prints the sale date once as a group header and omits it from each
  // row, so a row must inherit the last header seen above it.
  it("carries a group header value onto the rows beneath it", () => {
    const rows = parsePdfLines(
      [
        "Tax Deeds Surplus Funds Available",
        "07/16/2025",
        "123-2024 1234567 $5,000.00 SMITH JOHN 012345678901234",
        "08/20/2025",
        "124-2024 1234568 $6,250.50 DOE JANE 012345678901235",
      ],
      {
        columns: ["case_number", "certificate_number", "confirmed_amount", "claimant_name", "parcel_apn"],
        rowPattern: "^(\\d{1,4}-\\d{4})\\s+(\\d{6,10})\\s+\\$([\\d,]+\\.\\d{2})\\s*(.*?)\\s*(\\d{9,20})$",
        groupPattern: "^(\\d{2}/\\d{2}/\\d{4})$",
        groupField: "sale_date",
        skipLines: ["Tax Deeds Surplus Funds Available"],
      },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ case_number: "123-2024", confirmed_amount: 5000, sale_date: "2025-07-16" });
    expect(rows[1]).toMatchObject({ case_number: "124-2024", confirmed_amount: 6250.5, sale_date: "2025-08-20" });
  });

  it("rejoins rows the PDF wrapped and reads a spelled-out sale date (Hall GA)", () => {
    const config = {
      columns: ["sale_date", "purchaser", "parcel_apn", "owner_and_address", "confirmed_amount"],
      rowPattern:
        "^([A-Z][a-z]+ \\d{1,2}, \\d{4}) (.+?) ((?:\\d{5}[A-Z]?[ ]?\\d{6}[A-Z]?)|(?:[MP]\\d{6,8})) (.+?) ([\\d,]+\\.\\d{2})\\$$",
      joinPattern: "^[A-Z][a-z]+ \\d{1,2}, \\d{4} ",
      skipLines: ["HALL COUNTY TAX COMMISSIONER", "TAX SALE DATE"],
      defaultClaimStatus: "unclaimed" as const,
    };
    const rows = parsePdfLines(
      [
        "HALL COUNTY TAX COMMISSIONER - TAX SALE EXCESS FUNDS",
        "November 1, 2016 MARSHA PIPER 15032D000050A THOMASON GEORGIA 2200 ATHENS HWY GAINESVILLE 3,797.42$",
        "October 1, 2024 MARTEL ASSET MANAGEMENT",
        "LLC 01039A000003 JONES BRIAN H 605 NE CANDLER ST GAINESVILLE 105,607.85$",
      ],
      config,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ parcel_apn: "15032D000050A", confirmed_amount: 3797.42, sale_date: "2016-11-01" });
    // The wrapped second line belongs to the row above, not a dropped record.
    expect(rows[1]).toMatchObject({ parcel_apn: "01039A000003", confirmed_amount: 105607.85, sale_date: "2024-10-01" });
    expect(rows[1]?.claim_status).toBe("unclaimed");
  });

  it("skips balances the county marked REDEEMED (Henry GA)", () => {
    const config = {
      columns: ["parcel_apn", "owner_and_address", "sale_date", "confirmed_amount"],
      rowPattern: "^([A-Za-z0-9][A-Za-z0-9-]{7,13}) (.+?) (\\d{1,2}/\\d{1,2}/\\d{4}) \\$?([\\d,]+\\.\\d{2})\\$?$",
      skipLines: ["PARCEL ID OWNER"],
      defaultClaimStatus: "unclaimed" as const,
    };
    const rows = parsePdfLines(
      [
        "PARCEL ID OWNER ADDRESS SALE DATE EXCESS FUNDS",
        "018-01023001 PILOTO DANIA 947 BABBS MILL RD 2/4/2020 385.05$",
        // Redeemed rows keep the figure but append REDEEMED — that money is gone.
        "106B02019000 TOMLINSON HOWARD 78 MILLER RD 2/2/2021 39,874.68$ REDEEMED",
        "072-01044003 SAN MARCO ISLAND TRUST 545 FOSTER DR 11/3/2020 REDEEMED REDEEMED",
        // Some rows print the dollar sign in front instead of behind.
        "069B05014000 CHILDERS MICHAEL 220 WAKE DR, STB 5/7/2024 $15,385.05",
      ],
      config,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ parcel_apn: "018-01023001", confirmed_amount: 385.05, sale_date: "2020-02-04" });
    expect(rows[1]).toMatchObject({ parcel_apn: "069B05014000", confirmed_amount: 15385.05, sale_date: "2024-05-07" });
  });

  it("splits the defendant name off both address shapes and takes the balance (Athens-Clarke GA)", () => {
    const SUF = "(?:Ave|St|Dr|Rd|Ln|Pkwy|Ter|Ext|Way|Ct|Blvd|Cir|Pl|Hwy|Trl)";
    const amt = "\\(?[\\d,]+\\.\\d{2}\\)?\\$";
    const tail = `\\s+${amt}\\s+${amt}\\s+${amt}(?:\\s+${amt})?\\s+([\\d,]+\\.\\d{2})\\$$`;
    const config = {
      columns: ["sale_date", "claimant_name", "property_address", "confirmed_amount"],
      rowPatterns: [
        `^(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+(.+?)\\s+(\\d+\\s+[^$]*?${SUF}\\b[^$]*?)${tail}`,
        `^(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+(.+[^\\s\\d](?<!\\b[NSEW])(?<!\\b(?:NE|NW|SE|SW)))\\s+((?:[NSEW]{1,2}\\s+)?[A-Z][A-Za-z]{2,}(?:\\s+[A-Z][A-Za-z]{2,})*\\s+${SUF}\\s*\\/[^$]*?)${tail}`,
      ],
      skipLines: ["EXCESS TAX SALE FUNDS", "SALE DATE", "TAX COMMISSIONER"],
      defaultClaimStatus: "unclaimed" as const,
    };
    const rows = parsePdfLines(
      [
        "SALE DATE DEFENDANT IN FIFA PROPERTY DESCRIPTION BID AMT TAXES EXCESS CLAIMED BALANCE",
        "9/7/2021 Halliday, Katie 275 Sartain Dr / 232A A009 15,000.00$ 6,278.53$ 8,721.47$ 8,721.47$",
        // Partly claimed: the BALANCE column is what the county still holds.
        "12/2/2025 Porter, Bobby Jean & Johnson, Geraldine 235 Marlborough Downs Rd / 044C2 B003 50,000.00$ 4,238.34$ 45,761.66$ (11,440.42)$ 34,321.24$",
        // No house number, and a directional prefix that belongs to the street.
        "12/7/2021 Thomas, Florine Sanders E Broad St / 172C2 E030A 6,400.00$ 3,436.29$ 2,963.71$ 2,963.71$",
        // No house number, and a middle initial that belongs to the name.
        "6/2/2026 McKinney, Elizabeth L Magnolia Ter / 122C1 A002 22,000.00$ 1,903.64$ 20,096.32$ 20,096.32$",
      ],
      config,
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ claimant_name: "Halliday, Katie", property_address: "275 Sartain Dr / 232A A009", confirmed_amount: 8721.47 });
    expect(rows[1]).toMatchObject({ confirmed_amount: 34321.24, claim_status: "unclaimed" });
    expect(rows[2]).toMatchObject({ claimant_name: "Thomas, Florine Sanders", property_address: "E Broad St / 172C2 E030A" });
    expect(rows[3]).toMatchObject({ claimant_name: "McKinney, Elizabeth L", property_address: "Magnolia Ter / 122C1 A002" });
  });

  it("reads owner, map number and address off one line (Troup GA)", () => {
    const config = {
      columns: ["sale_date", "owner_name", "parcel_apn", "property_address", "confirmed_amount"],
      rowPattern:
        "^(\\d{1,2}/\\d{1,2}/\\d{4}) (.+?) ?(\\d{3,5}[A-Z]?[ -]\\d{3,4}[ -]\\d{3}[A-Z]?) (.+?) \\$([\\d,]+\\.\\d{2})$",
      skipLines: ["DATE OF", "Excess", "Funds", "OWNER MAP#"],
      defaultClaimStatus: "unclaimed" as const,
    };
    const rows = parsePdfLines(
      [
        "DATE OF",
        "SALE OWNER MAP# ADDRESS",
        "7/7/2020 NELSON REMBERTO GARCIA 0943D-025-006 1003 E. 8TH ST., WEST PT $74.27",
        "11/3/2020 WILLIE S MCCUTCHEN 0503C 032 010 300 CARVER ST., LAG $1,177.48",
        // The PDF sometimes runs a truncated owner name straight into the map number.
        "9/2/2025 ALVARO L ESQUIVAL & CLAUDIA R GONZA0941 000 064 7916 WEST POINT RD, WEST PT $9,260.93",
      ],
      config,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      parcel_apn: "0943D-025-006",
      property_address: "1003 E. 8TH ST., WEST PT",
      confirmed_amount: 74.27,
      sale_date: "2020-07-07",
    });
    expect(rows[1]).toMatchObject({ parcel_apn: "0503C 032 010", confirmed_amount: 1177.48 });
    expect(rows[2]).toMatchObject({ parcel_apn: "0941 000 064", confirmed_amount: 9260.93, sale_date: "2025-09-02" });
  });
});
