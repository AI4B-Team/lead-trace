/**
 * realauction_tab — some counties expose surplus/unclaimed funds as a tab on
 * the same RealAuction site the phase 1 adapter already visits.
 *
 * This reuses the existing vendor fetch path (proxy, browser UA, >=5s delay,
 * auction-window blackout, nightly byte cap) rather than opening a second one.
 * Parsing is the shared html_table code, since the tab renders as a table.
 */

import { auctionWindowBlock } from "../../data-providers/scraper-policy";
import { politeHtml } from "../../data-providers/scraper-policy";
import { parseHtmlTable } from "./html-table";
import { emptyResult, type HandlerContext, type HandlerResult } from "./types";

export async function runRealauctionTab(ctx: HandlerContext): Promise<HandlerResult> {
  const { source } = ctx;
  if (!source.source_url) return emptyResult("No source_url configured");
  const columnMap = (source.fetch_config?.["columnMap"] ?? null) as Record<string, string> | null;
  if (!columnMap || !Object.keys(columnMap).length) {
    return emptyResult("No columnMap in fetch_config — columns must be confirmed against the live tab");
  }
  const blackout = auctionWindowBlock();
  if (blackout.blocked) return emptyResult(blackout.reason ?? "Auction window blackout");

  const { html, bytes } = await politeHtml(source.source_url);
  const fetchedAt = new Date().toISOString();
  const rows = parseHtmlTable(html, columnMap);
  return {
    rows,
    fetchedAt,
    bytes,
    reason: rows.length ? undefined : "Tab fetched but no table matched the configured columns",
  };
}
