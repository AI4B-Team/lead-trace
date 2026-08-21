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

// ---------------------------------------------------------------------------
// Parcel-only surplus rows.
//
// Some clerks publish an owner-less, address-less surplus list — only a parcel,
// a sale date and the held balance (Marion FL is the canonical example). Those
// rows carry no phone AND no mailing address, so they are NOT skip-traceable
// (isTraceableRecordsLead is false) and, before this, dropped at the mobile-only
// gate as removedNoPhone. But a confirmed surplus balance keyed to a parcel is a
// real, valuable record: the money is claimable through the clerk by parcel. We
// keep it phone-blank instead of discarding it, so it reaches the Leads master
// with its Surplus / Sale Date / Escheat columns populated.
// ---------------------------------------------------------------------------
export function isSurplusPropertyLead(row: TraceableRow): boolean {
  const meta = (row.source_meta ?? {}) as {
    record_type?: unknown;
    surplus_amount?: unknown;
    parcel_apn?: unknown;
  };
  const isSurplus = typeof meta.record_type === "string" && /surplus/i.test(meta.record_type);
  const hasAmount =
    meta.surplus_amount != null && String(meta.surplus_amount).trim() !== "";
  const hasParcel = typeof meta.parcel_apn === "string" && meta.parcel_apn.trim() !== "";
  return isSurplus && hasAmount && hasParcel;
}

/**
 * Rows worth keeping with a blank phone on a records run: a deliverable property
 * lead (real address, skip-traceable) OR a parcel-keyed confirmed surplus record
 * (claimable by parcel even with no owner/address printed). Landline/VoIP rows
 * that DID come back still drop under mobile-only — this only spares no-phone rows.
 */
export function isKeepablePropertyLead(row: TraceableRow): boolean {
  return isTraceableRecordsLead(row) || isSurplusPropertyLead(row);
}

/**
 * Cloudflare Workers cap ~50 subrequests per invocation. Each trace costs 2
 * API calls (autocomplete + details), so 20 traces = ~40 subrequests and
 * leaves headroom for the DB writes in the same invocation.
 */
export const MAX_LIVE_TRACES = 20;
