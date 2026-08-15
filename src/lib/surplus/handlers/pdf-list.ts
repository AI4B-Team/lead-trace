/**
 * pdf_list — counties that publish a monthly surplus PDF.
 *
 * PDF text has no table structure, so the config supplies the column order and
 * a row pattern instead of selectors:
 *   { columns: ["case_number","property_address","confirmed_amount"],
 *     rowPattern?: string,   // regex with one capture group per column
 *     groupPattern?: string, // regex whose capture 1 is a value shared by the
 *     groupField?: string,   // rows that follow it (Osceola prints sale dates
 *                            // as group headers, not per-row cells)
 *     skipLines?: string[] } // headers/footers to ignore
 * Without a rowPattern we do not attempt to infer columns from whitespace: a
 * misaligned split would silently attach the wrong dollar amount to a case.
 */

import { politeFetch } from "../../data-providers/scraper-policy";
import { emptyResult, toClerkRow, type ClerkSurplusRow, type HandlerContext, type HandlerResult } from "./types";

export async function pdfToLines(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function parsePdfLines(
  lines: string[],
  config: {
    columns?: string[];
    rowPattern?: string;
    groupPattern?: string;
    groupField?: string;
    skipLines?: string[];
    columnMap?: Record<string, string>;
    defaultClaimStatus?: ClerkSurplusRow["claim_status"];
  },
): ClerkSurplusRow[] {
  const columns = config.columns ?? [];
  if (!config.rowPattern || !columns.length) return [];
  const re = new RegExp(config.rowPattern);
  const groupRe = config.groupPattern && config.groupField ? new RegExp(config.groupPattern) : null;
  let groupValue: string | null = null;
  const skip = (config.skipLines ?? []).map((s) => s.toLowerCase());
  const out: ClerkSurplusRow[] = [];
  for (const line of lines) {
    if (skip.some((s) => line.toLowerCase().includes(s))) continue;
    if (groupRe) {
      const g = line.match(groupRe);
      // A group header carries a value forward onto every row beneath it and is
      // never itself a record.
      if (g?.[1]) {
        groupValue = g[1].trim();
        continue;
      }
    }
    const m = line.match(re);
    if (!m) continue;
    const record: Record<string, string> = {};
    columns.forEach((col, i) => {
      record[col] = (m[i + 1] ?? "").trim();
    });
    if (config.groupField && groupValue && !record[config.groupField]) {
      record[config.groupField] = groupValue;
    }
    // Columns are already field names here, so the map is identity unless the
    // config overrides it.
    const fields = config.groupField ? [...columns, config.groupField] : columns;
    const map = config.columnMap ?? Object.fromEntries(fields.map((c) => [c, c]));
    const row = toClerkRow(record, map);
    if (!row) continue;
    // Only applied when the list prints no status word of its own — e.g. a
    // report the clerk already filtered down to funds still on hand.
    if (row.claim_status === "unknown" && config.defaultClaimStatus) {
      row.claim_status = config.defaultClaimStatus;
    }
    out.push(row);
  }
  return out;
}

export async function runPdfList(ctx: HandlerContext): Promise<HandlerResult> {
  const { source } = ctx;
  if (!source.source_url) return emptyResult("No source_url configured");
  const config = source.fetch_config as {
    columns?: string[];
    rowPattern?: string;
    groupPattern?: string;
    groupField?: string;
    skipLines?: string[];
    columnMap?: Record<string, string>;
    defaultClaimStatus?: ClerkSurplusRow["claim_status"];
  };
  if (!config?.rowPattern || !config.columns?.length) {
    return emptyResult("No rowPattern/columns in fetch_config — the PDF layout must be confirmed first");
  }
  const res = await politeFetch(source.source_url, { headers: { Accept: "application/pdf" } });
  const buf = new Uint8Array(await res.arrayBuffer());
  const fetchedAt = new Date().toISOString();
  const rows = parsePdfLines(await pdfToLines(buf), config);
  return {
    rows,
    fetchedAt,
    bytes: buf.byteLength,
    reason: rows.length ? undefined : "PDF fetched but no line matched the configured row pattern",
  };
}
