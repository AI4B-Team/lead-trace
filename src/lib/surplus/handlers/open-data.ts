/**
 * open_data — the rare county that publishes surplus as a real dataset.
 *
 * Queries the same Socrata/ArcGIS endpoints the discovery adapters already
 * probe, but reads raw attributes: fetchSocrataRows/fetchArcgisRows normalize
 * into the lead shape, which has no surplus amount or claim status to carry.
 * Config shape:
 *   { platform: "socrata" | "arcgis", endpoint: string, where?: string,
 *     columnMap: { "<dataset field>": "<our field>" } }
 */

import { politeJson } from "../../data-providers/scraper-policy";
import { emptyResult, toClerkRow, type ClerkSurplusRow, type HandlerContext, type HandlerResult } from "./types";

export async function runOpenData(ctx: HandlerContext): Promise<HandlerResult> {
  const { source } = ctx;
  const config = source.fetch_config as {
    platform?: "socrata" | "arcgis";
    endpoint?: string;
    where?: string;
    limit?: number;
    columnMap?: Record<string, string>;
  };
  const endpoint = config?.endpoint ?? source.source_url;
  if (!config?.platform || !endpoint) return emptyResult("No platform/endpoint in fetch_config");
  if (!config.columnMap || !Object.keys(config.columnMap).length) {
    return emptyResult("No columnMap in fetch_config — dataset fields must be confirmed first");
  }

  const limit = config.limit ?? 1000;
  let raw: Array<Record<string, unknown>>;
  if (config.platform === "socrata") {
    const params = new URLSearchParams({ $limit: String(limit) });
    if (config.where) params.set("$where", config.where);
    raw = await politeJson<Array<Record<string, unknown>>>(
      `${endpoint.replace(/\?.*$/, "")}?${params}`,
    );
  } else {
    const params = new URLSearchParams({
      where: config.where ?? "1=1",
      outFields: "*",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: String(limit),
    });
    const json = await politeJson<{
      features?: Array<{ attributes?: Record<string, unknown> }>;
      error?: { message?: string };
    }>(`${endpoint.replace(/\/$/, "")}/query?${params}`);
    if (json.error) throw new Error(json.error.message ?? "ArcGIS Query Failed");
    raw = (json.features ?? []).map((f) => f.attributes ?? {});
  }

  const fetchedAt = new Date().toISOString();
  const rows: ClerkSurplusRow[] = [];
  for (const record of raw) {
    const cells: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) cells[k] = v == null ? "" : String(v);
    const row = toClerkRow(cells, config.columnMap);
    if (row) rows.push(row);
  }
  return {
    rows,
    fetchedAt,
    bytes: JSON.stringify(raw).length,
    reason: rows.length ? undefined : "Dataset returned no rows matching the configured fields",
  };
}
