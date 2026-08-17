import { politeFetch } from "../../src/lib/data-providers/scraper-policy";
import { pdfToLines, parsePdfLines } from "../../src/lib/surplus/handlers/pdf-list";

const LA = {
  columns: ["parcel_apn", "case_number", "purchase_price", "confirmed_amount"],
  rowPattern: String.raw`^(\d{4}-\d{3}-\d{3})\s+(\d+)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$`,
  defaultClaimStatus: "unclaimed" as const,
};
const JOIN = String.raw`^(?:\d{2,4}\s+)?\d{3}-\d{3}-\d{2}\s+\d{2}-\d{6}`;
const OC = {
  columns: ["case_number","parcel_apn","default_number","claimant_name","property_address","minimum_bid","sale_price","confirmed_amount","recording_date"],
  rowPatterns: [
    String.raw`^(\d{2,4})\s+(\d{3}-\d{3}-\d{2})\s+(\d{2}-\d{6})\s+(.+?)\s+((?:SITUS NA|NO SITUS|\d[^$]*?),\s*[A-Z][A-Z ]+?)\s+\$?([\d,]+(?:\.\d{2})?)\$?\s+\$?([\d,]+(?:\.\d{2})?)\$?\s+\$?([\d,]+\.\d{2})\$?\s+(\d{1,2}/\d{1,2}/\d{2,4})\b`,
  ],
  joinPattern: JOIN,
  defaultClaimStatus: "unclaimed" as const,
};
const OC_TS = {
  columns: ["parcel_apn","case_number","property_type","claimant_name","property_address","minimum_bid","sale_price","confirmed_amount","sale_date","recording_date"],
  rowPatterns: [
    String.raw`^(\d{3}-\d{3}-\d{2})\s+(\d{2}-\d{6})\s+([A-Z]+)\s+(.+?)\s+((?:NO SITUS|SITUS NA|\d[^$]*?))\s+\$?([\d,]+\.\d{2})\$?\s+\$?([\d,]+\.\d{2})\$?\s+\$?([\d,]+\.\d{2})\$?\s+(\d{1,2}/\d{1,2}/\d{2,4})\s+(\d{1,2}/\d{1,2}/\d{2,4})\b`,
  ],
  joinPattern: JOIN,
  defaultClaimStatus: "unclaimed" as const,
};
const SJ = {
  columns: ["case_number","parcel_apn","default_number","claimant_name","property_address","redemption_amount","purchase_price","confirmed_amount"],
  rowPattern: String.raw`^(\d+)\s+(\d{3}-\d{3}-\d{3}-\d{3})\s+(DEF-[\d-]+)\s+(.+?)\s+((?:NO SITUS|\d[^$]*?))\s+([\d,]+\.\d{2})\$\s+([\d,]+\.\d{2})\$\s+([\d,]+\.\d{2})\$$`,
  defaultClaimStatus: "unclaimed" as const,
};

const jobs: Array<[string, string, any]> = [
  ["LA","https://ttc.lacounty.gov/wp-content/uploads/2026/07/EP-Listing-Public-2026A.pdf",LA],
  ["OC1397","https://octreasurer.gov/sites/ttc/files/2021-10/Excess%20Proceeds%20-%20Internet%20Auction%20%231397.pdf",OC],
  ["OC1398","https://www.octreasurer.gov/sites/ttc/files/2025-11/Excess%20Proceeds%20Timeshare%20Re-Offer%20Auction%201398.pdf",OC_TS],
  ["SJ","https://www.sjgov.org/docs/default-source/treasurer---tax-collector-documents/excess-proceeds/excess-proceeds-march-2026.pdf?sfvrsn=1f82eec3_21",SJ],
];
for (const [name, u, cfg] of jobs) {
  const res = await politeFetch(u, { headers: { Accept: "application/pdf" } });
  const lines = await pdfToLines(new Uint8Array(await res.arrayBuffer()));
  const rows = parsePdfLines(lines, cfg);
  const money = rows.filter((r) => r.confirmed_amount);
  console.log(`### ${name}: lines=${lines.length} parsed=${rows.length} withMoney=${money.length} total=$${money.reduce((a, r) => a + (r.confirmed_amount ?? 0), 0).toLocaleString()}`);
  const pats = [cfg.rowPattern, ...(cfg.rowPatterns ?? [])].filter(Boolean).map((p: string) => new RegExp(p));
  const joined = cfg.joinPattern ? (await import("../../src/lib/surplus/handlers/pdf-list")).joinWrappedLines(lines, cfg.joinPattern) : lines;
  const miss = joined.filter((l) => /\$\d|\d\.\d{2}\$/.test(l) && !pats.some((r) => r.test(l)));
  console.log("  unmatched money lines:", miss.length);
  console.log(miss.slice(0, 5).map((m) => "   ~ " + m).join("\n"));
  console.log("  sample:", JSON.stringify(money[0] ?? null));
}
