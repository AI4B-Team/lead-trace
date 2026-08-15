/**
 * xlsx_list — clerks that publish the held-surplus list as a spreadsheet.
 *
 * Hillsborough FL is the reference case: a weekly "Tax Deed" workbook whose
 * first row is an as-of note and whose real header row is row 2
 * (CASE NUMBER | BALANCE). Its filename carries the publish date, so the config
 * can point at the clerk's index page and let us resolve the current file
 * instead of pinning a URL that dies next week:
 *   { sheet?: string, headerRow?: number (1-based), columnMap: { "<header>": "<field>" },
 *     defaultClaimStatus?: "unclaimed" | "claim_filed" | "disbursed" | "escheated",
 *     indexUrl?: string, linkPattern?: string }
 * Without a columnMap we parse nothing and say why — guessing which column is
 * the dollar figure is how a wrong amount reaches a customer.
 */

import { politeFetch, politeHtml } from "../../data-providers/scraper-policy";
import { emptyResult, toClerkRow, type ClerkSurplusRow, type HandlerContext, type HandlerResult } from "./types";

export type XlsxListConfig = {
  sheet?: string;
  headerRow?: number;
  columnMap?: Record<string, string>;
  defaultClaimStatus?: ClerkSurplusRow["claim_status"];
  /** Clerk page that links the current workbook (filenames rotate weekly). */
  indexUrl?: string;
  /** Regex matched against each href on indexUrl; first match wins. */
  linkPattern?: string;
};

/** Newest workbook link on a clerk index page, absolute. */
export function pickWorkbookLink(html: string, base: string, linkPattern?: string): string | null {
  const re = linkPattern ? new RegExp(linkPattern, "i") : /\.xlsx?(\?|$)/i;
  const hrefs: string[] = [];
  const hrefRe = /href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html))) hrefs.push(m[1]!);
  const hit = hrefs.find((h) => re.test(h));
  if (!hit) return null;
  try {
    return new URL(hit.replace(/&amp;/g, "&"), base).toString();
  } catch {
    return null;
  }
}

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
  const config = (source.fetch_config ?? {}) as XlsxListConfig;
  if (!source.source_url && !config.indexUrl) return emptyResult("No source_url or indexUrl configured");
  if (!config.columnMap || !Object.keys(config.columnMap).length) {
    return emptyResult("No columnMap in fetch_config — spreadsheet columns must be confirmed first");
  }
  let fileUrl = source.source_url;
  if (config.indexUrl) {
    const { html } = await politeHtml(config.indexUrl);
    const found = pickWorkbookLink(html, config.indexUrl, config.linkPattern);
    // A stale pinned URL is better than nothing, but no URL at all is a gap.
    if (!found && !fileUrl) return emptyResult("Index page carried no workbook link matching linkPattern");
    if (found) fileUrl = found;
  }
  const res = await politeFetch(fileUrl!, {
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