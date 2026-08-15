/**
 * xlsx_list — clerks that publish the held-surplus list as a spreadsheet.
 *
 * Hillsborough FL is the reference case: a weekly "Tax Deed" workbook whose
 * first row is an as-of note and whose real header row is row 2
 * (CASE NUMBER | BALANCE). Config mirrors html_table plus a sheet/header hint:
 *   { sheet?: string, headerRow?: number (1-based), columnMap: { "<header>": "<field>" },
 *     defaultClaimStatus?: "unclaimed" | "claim_filed" | "disbursed" | "escheated" }
 * Without a columnMap we parse nothing and say why — guessing which column is
 * the dollar figure is how a wrong amount reaches a customer.
 */

import { politeFetch } from "../../data-providers/scraper-policy";
import { emptyResult, toClerkRow, type ClerkSurplusRow, type HandlerContext, type HandlerResult } from "./types";

export type XlsxListConfig = {
  sheet?: string;
  headerRow?: number;
  columnMap?: Record<string, string>;
  defaultClaimStatus?: ClerkSurplusRow["claim_status"];
};

/** Rows as text, in sheet order, so the same column logic as html_table applies. */
export async function sheetToMatrix(bytes: Uint8Array, sheetName?: string): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  if (!name) return [];
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  return matrix.map((row) => (row ?? []).map((cell) => (cell == null ? "" : String(cell).trim())));
}

export function parseXlsxMatrix(matrix: string[][], config: XlsxListConfig): ClerkSurplusRow[] {
  const columnMap = config.columnMap ?? {};
  if (!Object.keys(columnMap).length) return [];
  const wanted = Object.keys(columnMap).map((c) => c.toLowerCase().trim());
  // Locate the header row: the configured one, else the first row that carries a
  // configured column name (clerk workbooks often lead with an as-of note).
  let headerIndex = config.headerRow != null ? config.headerRow - 1 : -1;
  if (headerIndex < 0) {
    headerIndex = matrix.findIndex((row) => row.some((cell) => wanted.includes(cell.toLowerCase().trim())));
  }
  if (headerIndex < 0 || headerIndex >= matrix.length) return [];
  const names = (matrix[headerIndex] ?? []).map((h) => h.trim());
  const out: ClerkSurplusRow[] = [];
  for (const cells of matrix.slice(headerIndex + 1)) {
    if (!cells.some((c) => c)) continue;
    const record: Record<string, string> = {};
    names.forEach((name, i) => {
      if (name) record[name] = cells[i] ?? "";
    });
    const row = toClerkRow(record, columnMap);
    if (!row) continue;
    if (row.claim_status === "unknown" && config.defaultClaimStatus) {
      row.claim_status = config.defaultClaimStatus;
    }
    out.push(row);
  }
  return out;
}

export async function runXlsxList(ctx: HandlerContext): Promise<HandlerResult> {
  const { source } = ctx;
  if (!source.source_url) return emptyResult("No source_url configured");
  const config = (source.fetch_config ?? {}) as XlsxListConfig;
  if (!config.columnMap || !Object.keys(config.columnMap).length) {
    return emptyResult("No columnMap in fetch_config — spreadsheet columns must be confirmed first");
  }
  const res = await politeFetch(source.source_url, {
    headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  const fetchedAt = new Date().toISOString();
  const rows = parseXlsxMatrix(await sheetToMatrix(buf, config.sheet), config);
  return {
    rows,
    fetchedAt,
    bytes: buf.byteLength,
    reason: rows.length ? undefined : "Workbook fetched but no row matched the configured columns",
  };
}