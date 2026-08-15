/**
 * Surplus intake for the records-request path (server-only).
 *
 * WHY: for the Florida counties whose clerks publish no machine-readable
 * surplus list — and for the WAF counties we cannot read at all — the only
 * remaining path is the one the clerk already supports: a public-records request
 * that comes back as an emailed spreadsheet. That mail lands on the existing
 * records@ inbound hook, but the generic ingest there turns rows into LEADS.
 * Surplus rows must instead become clerk-confirmed `surplus_funds` rows in
 * distress_records, exactly like the scraped clerk-primary path, so the feed,
 * county guide pages and reconciliation all keep working unchanged.
 *
 * Invariants (identical to clerk-primary.server.ts):
 *   - No positive amount → no row. Unknown is a gap, never a zero.
 *   - doc_number is stable, so a monthly re-send updates instead of duplicating.
 *   - Rows are clerk-confirmed: `estimated: false`.
 *   - A file whose amount column cannot be identified writes NOTHING and is
 *     queued for a one-time human mapping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { countyKey } from "../distress-feed.shared";
import { ingestDistressRecords, type RawFiling } from "../distress-feed.server";
import { toClerkRow, type ClerkSurplusRow } from "./handlers";
import { clerkRowToFiling } from "./clerk-primary.server";
import { inferSurplusColumnMap, isUsableSurplusMap, matrixToRecords } from "./records-request-intake";
import type { SurplusSourceRow } from "./handlers";

type DB = SupabaseClient<Database>;

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

export type SurplusIntakeResult = {
  status: "parsed" | "needs_mapping" | "skipped" | "failed";
  filename: string;
  county: string | null;
  state: string | null;
  rowsTotal: number;
  withAmount: number;
  written: number;
  reason?: string;
};

/** True when this agency's request is the surplus one (not code violations etc). */
export async function agencyHandlesSurplus(agencyId: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db
    .from("records_requests")
    .select("record_types")
    .eq("agency_id", agencyId)
    .maybeSingle();
  const types = ((data as { record_types?: string[] } | null)?.record_types ?? []).map((t) =>
    String(t).toLowerCase(),
  );
  if (types.some((t) => t.includes("surplus"))) return true;
  const { data: agency } = await db
    .from("agency_contacts")
    .select("record_types")
    .eq("id", agencyId)
    .maybeSingle();
  return ((agency as { record_types?: string[] } | null)?.record_types ?? []).some((t) =>
    String(t).toLowerCase().includes("surplus"),
  );
}

/** CSV text or workbook bytes → the records the clerk actually sent. */
export async function attachmentToRecords(args: {
  filename: string;
  text?: string;
  bytes?: Uint8Array;
}): Promise<Array<Record<string, string>>> {
  if (/\.xlsx?$/i.test(args.filename) && args.bytes?.length) {
    const { sheetToMatrix } = await import("./handlers/xlsx-list");
    return matrixToRecords(await sheetToMatrix(args.bytes));
  }
  const { csvToRecords } = await import("../data-providers/bulk-file");
  const rows = csvToRecords(args.text ?? "");
  return rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v).trim()])),
  );
}

/**
 * Ingest one emailed clerk surplus list for an agency. Never throws for data
 * reasons — a bad file is reported, logged as needs_mapping, and the sweep of
 * other counties continues.
 */
export async function ingestSurplusRequestFile(args: {
  agencyId: string;
  filename: string;
  text?: string;
  bytes?: Uint8Array;
}): Promise<SurplusIntakeResult> {
  const db = await admin();
  const base: SurplusIntakeResult = {
    status: "failed",
    filename: args.filename,
    county: null,
    state: null,
    rowsTotal: 0,
    withAmount: 0,
    written: 0,
  };

  const { data: agencyRow } = await db
    .from("agency_contacts")
    .select("id, agency_name, county_name, state")
    .eq("id", args.agencyId)
    .maybeSingle();
  const agency = agencyRow as { agency_name: string; county_name: string | null; state: string } | null;
  if (!agency?.county_name) {
    return { ...base, status: "skipped", reason: "Agency Has No County On File" };
  }
  base.county = agency.county_name;
  base.state = agency.state;

  const { data: req } = await db
    .from("records_requests")
    .select("id")
    .eq("agency_id", args.agencyId)
    .maybeSingle();
  const requestId = (req as { id?: string } | null)?.id ?? null;

  const logFile = async (parse_status: string, extra: Record<string, unknown> = {}) => {
    await db.from("records_request_files").insert({
      request_id: requestId,
      agency_id: args.agencyId,
      filename: args.filename,
      file_type: args.filename.split(".").pop()?.toLowerCase() ?? null,
      parse_status,
      ...extra,
    } as never);
  };

  let records: Array<Record<string, string>> = [];
  try {
    records = await attachmentToRecords(args);
  } catch (err) {
    await logFile("failed", { parse_error: err instanceof Error ? err.message : String(err) });
    return { ...base, reason: err instanceof Error ? err.message : String(err) };
  }
  base.rowsTotal = records.length;

  const headers = Object.keys(records[0] ?? {});
  const map = inferSurplusColumnMap(headers);
  if (!records.length || !isUsableSurplusMap(map)) {
    await logFile("needs_mapping", {
      rows_total: records.length,
      parse_error: "Could Not Identify The Surplus Amount Column — Needs One-Time Mapping",
    });
    if (requestId) await db.from("records_requests").update({ status: "needs_mapping" }).eq("id", requestId);
    return { ...base, status: "needs_mapping", reason: "Queued For One-Time Column Mapping" };
  }

  const clerkRows: ClerkSurplusRow[] = [];
  for (const rec of records) {
    const row = toClerkRow(rec, map);
    if (row) clerkRows.push(row);
  }

  // A records-request county may or may not have a surplus_sources row; when it
  // does, its sale_kind decides the surplus basis (tax deed = over opening bid).
  const { data: sourceRow } = await db
    .from("surplus_sources")
    .select("id, sale_kind, source_url, status")
    .eq("state", agency.state)
    .ilike("county_name", agency.county_name)
    .eq("handler", "records_request")
    .limit(1)
    .maybeSingle();
  const source = sourceRow as
    | { id: string; sale_kind: string; source_url: string | null; status: string }
    | null;
  const saleKind = source?.sale_kind ?? "tax_deed";
  const fips = countyKey(agency.state, agency.county_name);

  const filings: RawFiling[] = [];
  for (const row of clerkRows) {
    const filing = clerkRowToFiling(row, {
      fips,
      state: agency.state,
      county: agency.county_name,
      saleKind,
      sourceUrl: source?.source_url ?? null,
    });
    if (filing) {
      filing.raw = { ...(filing.raw ?? {}), via: "public_records_request", agency: agency.agency_name };
      filings.push(filing);
    }
  }
  base.withAmount = filings.length;

  if (!filings.length) {
    await logFile("parsed", { rows_total: records.length, rows_parsed: 0, parse_error: "No Row Carried A Positive Amount" });
    return { ...base, status: "parsed", reason: "No Row Carried A Positive Amount" };
  }

  try {
    base.written = await ingestDistressRecords(
      db,
      { state: agency.state, county: agency.county_name, recordType: "surplus_funds" },
      filings,
    );
  } catch (err) {
    await logFile("failed", { rows_total: records.length, parse_error: err instanceof Error ? err.message : String(err) });
    return { ...base, reason: err instanceof Error ? err.message : String(err) };
  }

  const nowIso = new Date().toISOString();
  await logFile("parsed", { rows_total: records.length, rows_parsed: base.written });
  if (requestId)
    await db
      .from("records_requests")
      .update({ status: "received", last_received_at: nowIso, last_error: null })
      .eq("id", requestId);
  if (source?.id)
    await db
      .from("surplus_sources")
      .update({ last_checked_at: nowIso, last_success_at: nowIso, consecutive_failures: 0, status: "live" })
      .eq("id", source.id);

  // Keep the coverage registry honest: this county now has clerk-confirmed rows.
  const { count: coveredRows } = await db
    .from("distress_records")
    .select("id", { count: "exact", head: true })
    .eq("record_type", "surplus_funds")
    .eq("fips", fips);
  const patch = {
    last_success_at: nowIso,
    status: "verified",
    ...(typeof coveredRows === "number" ? { sample_row_count: coveredRows } : {}),
  };
  const { data: updated } = await db
    .from("source_coverage")
    .update(patch)
    .eq("state", agency.state)
    .ilike("county_name", agency.county_name)
    .eq("record_type", "surplus_funds")
    .select("id");
  if (!updated?.length) {
    await db.from("source_coverage").insert({
      state: agency.state,
      county_name: agency.county_name,
      record_type: "surplus_funds",
      fips,
      verified_at: nowIso,
      ...patch,
    } as never);
  }

  return { ...base, status: "parsed" };
}

/**
 * Nightly pass over the counties whose only path is a public-records request.
 *
 * This schedules (never spams): the underlying engine keeps ONE request per
 * agency per cadence, so a county with a contact on file gets a fresh request
 * only when its cycle is due. A county with no confirmed records-custodian
 * address is reported as awaiting a contact — we do not guess an email address.
 */
export async function sweepRecordsRequestSurplusSources(): Promise<{
  results: Array<{ county: string; state: string; status: "scheduled" | "awaiting_contact"; reason?: string }>;
}> {
  const db = await admin();
  const { data } = await db
    .from("surplus_sources")
    .select("*")
    .eq("handler", "records_request")
    .in("status", ["live", "manual"]);
  const sources = (data ?? []) as unknown as SurplusSourceRow[];
  const { runRecordsRequest } = await import("./handlers/records-request");
  const results: Array<{ county: string; state: string; status: "scheduled" | "awaiting_contact"; reason?: string }> = [];
  for (const source of sources) {
    let reason: string | undefined;
    try {
      reason = (await runRecordsRequest({ source })).reason;
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
    const awaiting = /no records-request contact/i.test(reason ?? "");
    results.push({
      county: source.county_name,
      state: source.state,
      status: awaiting ? "awaiting_contact" : "scheduled",
      ...(reason ? { reason } : {}),
    });
    await db.from("surplus_sources").update({ last_checked_at: new Date().toISOString() }).eq("id", source.id);
  }
  return { results };
}