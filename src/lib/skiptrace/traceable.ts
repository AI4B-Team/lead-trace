// ---------------------------------------------------------------------------
// Which rows on a "records" run are eligible for skip trace.
//
// Live county scrapers stamp source_meta.provider. Rows pulled from the
// distress_records fallback come through distressRowToLead() and stamp
// source_meta.source = "distress_feed" with NO provider key — they carry a
// real property address and legitimately have no phone, so they are exactly
// the rows that MUST be traced.
// ---------------------------------------------------------------------------

export type TraceableRow = {
  address?: string | null;
  source_meta?: unknown;
};

export function isTraceableRecordsLead(row: TraceableRow): boolean {
  if (!row.address || !String(row.address).trim()) return false;
  const meta = (row.source_meta ?? {}) as { provider?: unknown; source?: unknown };
  if (typeof meta.provider === "string" && meta.provider.trim()) return true;
  return meta.source === "distress_feed";
}

export function hasTraceableRecordsRows(rows: TraceableRow[]): boolean {
  return rows.some(isTraceableRecordsLead);
}

/**
 * Cloudflare Workers cap ~50 subrequests per invocation. Each trace costs 2
 * API calls (autocomplete + details), so 20 traces = ~40 subrequests and
 * leaves headroom for the DB writes in the same invocation.
 */
export const MAX_LIVE_TRACES = 20;
