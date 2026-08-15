import { runHtmlTable } from "./html-table";
import { runOpenData } from "./open-data";
import { runPdfList } from "./pdf-list";
import { runRealauctionTab } from "./realauction-tab";
import { runRecordsRequest } from "./records-request";
import { runXlsxList } from "./xlsx-list";
import type { HandlerContext, HandlerResult, SurplusHandlerName } from "./types";

/**
 * The whole registry: six handlers keyed by name. A county is a config row
 * pointing at one of these, never a bespoke module.
 */
export const SURPLUS_HANDLERS: Record<
  SurplusHandlerName,
  (ctx: HandlerContext) => Promise<HandlerResult>
> = {
  html_table: runHtmlTable,
  pdf_list: runPdfList,
  xlsx_list: runXlsxList,
  realauction_tab: runRealauctionTab,
  open_data: runOpenData,
  records_request: runRecordsRequest,
};

export * from "./types";
