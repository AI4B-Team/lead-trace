/**
 * html_table — the most common clerk shape: a surplus / unclaimed-funds page
 * with one <table> of rows.
 *
 * Regex parsing, matching the convention in realauction.ts (no DOM in the
 * Worker runtime). Every selector and column name comes from fetch_config:
 *   { tableSelector?: string, headerRow?: number, columnMap: { "<header>": "<field>" } }
 * A source whose columnMap is absent parses nothing and reports why — guessing
 * column meanings is how you publish a wrong dollar figure.
 */

import { politeHtml } from "../../data-providers/scraper-policy";
import { emptyResult, toClerkRow, type ClerkSurplusRow, type HandlerContext, type HandlerResult } from "./types";

export function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Every <table> on the page, outermost first. */
export function extractTables(html: string): string[] {
  const out: string[] = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[0]);
  return out;
}

export function extractRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(tableHtml))) {
    const cells: string[] = [];
    const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(r[0]))) cells.push(stripTags(c[1] ?? ""));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/**
 * Pick the table that actually holds the surplus list: the one whose header row
 * matches the most configured column names. Falls back to nothing rather than
 * to the first table, which on clerk sites is usually page furniture.
 */
export function pickTable(tables: string[], columns: string[]): { rows: string[][]; index: number } | null {
  type Pick = { rows: string[][]; index: number; score: number };
  let best: Pick | null = null;
  tables.forEach((t, index) => {
    const rows = extractRows(t);
    if (rows.length < 2) return;
    const header = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
    const score = columns.filter((c) => header.includes(c.toLowerCase().trim())).length;
    if (score && (!best || score > best.score)) best = { rows, index, score } satisfies Pick;
  });
  const hit = best as Pick | null;
  return hit ? { rows: hit.rows, index: hit.index } : null;
}

export function parseHtmlTable(
  html: string,
  columnMap: Record<string, string>,
  /**
   * Used only when the clerk publishes no status column at all — several
   * counties publish a list that *is* the outstanding balances by definition.
   * It never overrides a status the page actually printed.
   */
  defaultClaimStatus?: ClerkSurplusRow["claim_status"],
): ClerkSurplusRow[] {
  const columns = Object.keys(columnMap);
  const picked = pickTable(extractTables(html), columns);
  if (!picked) return [];
  const [header, ...body] = picked.rows;
  const names = (header ?? []).map((h) => h.trim());
  const out: ClerkSurplusRow[] = [];
  for (const cells of body) {
    if (cells.length < 2) continue;
    const record: Record<string, string> = {};
    names.forEach((name, i) => {
      if (name) record[name] = cells[i] ?? "";
    });
    const row = toClerkRow(record, columnMap);
    if (!row) continue;
    if (row.claim_status === "unknown" && defaultClaimStatus) row.claim_status = defaultClaimStatus;
    out.push(row);
  }
  return out;
}

export async function runHtmlTable(ctx: HandlerContext): Promise<HandlerResult> {
  const { source } = ctx;
  if (!source.source_url) return emptyResult("No source_url configured");
  const columnMap = (source.fetch_config?.["columnMap"] ?? null) as Record<string, string> | null;
  if (!columnMap || !Object.keys(columnMap).length) {
    return emptyResult("No columnMap in fetch_config — columns must be confirmed against the live page");
  }
  const { html, bytes } = await politeHtml(source.source_url);
  const fetchedAt = new Date().toISOString();
  const defaultClaimStatus = source.fetch_config?.["defaultClaimStatus"] as ClerkSurplusRow["claim_status"] | undefined;
  const rows = parseHtmlTable(html, columnMap, defaultClaimStatus);
  return {
    rows,
    fetchedAt,
    bytes,
    reason: rows.length ? undefined : "Page fetched but no table matched the configured columns",
  };
}
