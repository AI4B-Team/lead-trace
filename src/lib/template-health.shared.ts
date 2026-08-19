/**
 * Template Health Agent — pure logic.
 *
 * Our templates ride on third-party Apify actors and county portals that change
 * without notice. A silent break means a customer burns credits and gets zero
 * or degraded rows. The point of this module is field-level fill-rate tracking,
 * not a simple up/down ping: a source that quietly stops returning phone
 * numbers while we keep charging full credits is worse than a hard failure.
 */

import { REALEFLOW_LEAD_CONFIGS } from "@/lib/data-providers/realeflow-source.shared";
import { RECORD_TYPE_TEMPLATE_IDS, templateForRecordType } from "@/lib/record-types";

export type HealthStatus = "healthy" | "degraded" | "broken";

/**
 * Health is a property of a DATA PATH, not of the "records" category.
 *
 * Probate, tax defaults and vacancy come from the licensed RealeFlow /search
 * API; code violations come from county open data. A single failing open-data
 * probe used to be fanned out to every records template and greyed out the
 * licensed types too. Both lists below are derived from existing config
 * (REALEFLOW_LEAD_CONFIGS + the record-type→template map) so they cannot drift.
 */
export function licensedRecordTemplateIds(opts: { enabledOnly?: boolean } = {}): string[] {
  const ids = new Set<string>();
  for (const config of REALEFLOW_LEAD_CONFIGS) {
    if (opts.enabledOnly && !config.enabled) continue;
    const templateId = templateForRecordType(config.recordType);
    if (templateId) ids.add(templateId);
  }
  return [...ids];
}

/** Record-type templates whose live rows come from open data, and only those. */
export function openDataRecordTemplateIds(): string[] {
  // Licensed membership counts even for entitlement-pending types: they are not
  // open-data-backed, so an open-data outage says nothing about them.
  const licensed = new Set(licensedRecordTemplateIds());
  return RECORD_TYPE_TEMPLATE_IDS.filter((id) => !licensed.has(id));
}

/** Fields whose fill rate we track and alert on. */
export const KEY_FIELDS = ["name", "address", "phone", "website"] as const;
export type KeyField = (typeof KEY_FIELDS)[number];

/** A key field's fill rate may not fall more than this far below baseline. */
export const DEGRADED_DROP = 0.3;

/** Rows a canary run is allowed to pull. Small on purpose — this runs daily. */
export const CANARY_ROW_CAP = 5;

export type FillRates = Partial<Record<KeyField, number>>;

export type CanaryRow = {
  business_name?: string | null;
  full_name?: string | null;
  address?: string | null;
  phone?: string | null;
  source_meta?: Record<string, unknown> | null;
};

const PHONE_RE = /^\+?1?\d{10}$/;
/** Loose "does this parse as a street address" test: number + street words. */
const ADDRESS_RE = /\d+\s+\S+/;

function fieldValue(row: CanaryRow, field: KeyField): string {
  if (field === "name") return String(row.business_name ?? row.full_name ?? "").trim();
  if (field === "address") return String(row.address ?? "").trim();
  if (field === "phone") return String(row.phone ?? "").trim();
  const website = (row.source_meta as { website?: unknown } | null | undefined)?.website;
  return typeof website === "string" ? website.trim() : "";
}

/** A value counts as filled only when it is also structurally plausible. */
function isPlausible(field: KeyField, value: string): boolean {
  if (!value) return false;
  if (field === "phone") return PHONE_RE.test(value.replace(/\D/g, "").replace(/^1?/, "1").slice(-11));
  if (field === "address") return ADDRESS_RE.test(value);
  if (field === "website") return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(value);
  return value.length > 1;
}

export function computeFillRates(rows: CanaryRow[]): FillRates {
  const out: FillRates = {};
  if (rows.length === 0) return out;
  for (const field of KEY_FIELDS) {
    const filled = rows.filter((r) => isPlausible(field, fieldValue(r, field))).length;
    out[field] = Number((filled / rows.length).toFixed(3));
  }
  return out;
}

export type Assessment = {
  status: HealthStatus;
  /** Fields that dropped more than DEGRADED_DROP below baseline. */
  degradedFields: KeyField[];
  notes: string;
  /** Baseline to persist after this run (unchanged unless healthy). */
  nextBaseline: FillRates;
};

/**
 * Status logic:
 *   zero rows or a hard error            -> broken
 *   a key field more than 30% below base -> degraded (baseline held)
 *   otherwise                            -> healthy (baseline blended forward)
 */
export function assess(args: {
  rows: CanaryRow[];
  baseline: FillRates;
  hardError?: string | null;
}): Assessment {
  const { rows, baseline, hardError } = args;

  if (hardError) {
    return { status: "broken", degradedFields: [], notes: hardError.slice(0, 400), nextBaseline: baseline };
  }
  if (rows.length === 0) {
    return { status: "broken", degradedFields: [], notes: "Canary run returned zero rows.", nextBaseline: baseline };
  }

  const fill = computeFillRates(rows);
  const degradedFields: KeyField[] = [];
  for (const field of KEY_FIELDS) {
    const base = baseline[field];
    const now = fill[field] ?? 0;
    // Nothing to compare against, or the source never returned this field.
    if (typeof base !== "number" || base <= 0.05) continue;
    if (now < base * (1 - DEGRADED_DROP)) degradedFields.push(field);
  }

  if (degradedFields.length > 0) {
    const detail = degradedFields
      .map((f) => `${f} ${(100 * (fill[f] ?? 0)).toFixed(0)}% vs baseline ${(100 * (baseline[f] ?? 0)).toFixed(0)}%`)
      .join("; ");
    return {
      status: "degraded",
      degradedFields,
      notes: `Fill rate dropped: ${detail}.`,
      nextBaseline: baseline,
    };
  }

  // Healthy: blend the new observation into the baseline so it tracks reality
  // without a single lucky run resetting it.
  const nextBaseline: FillRates = { ...baseline };
  for (const field of KEY_FIELDS) {
    const now = fill[field];
    if (typeof now !== "number") continue;
    const base = baseline[field];
    nextBaseline[field] = typeof base === "number" ? Number((base * 0.7 + now * 0.3).toFixed(3)) : now;
  }
  return { status: "healthy", degradedFields: [], notes: "", nextBaseline };
}

/* --------------------------------- presentation ------------------------- */

export const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Working Normally",
  degraded: "Returning Less Data Than Usual",
  broken: "Temporarily Unavailable",
};

export const HEALTH_DOT: Record<HealthStatus, string> = {
  healthy: "bg-success",
  degraded: "bg-warning",
  broken: "bg-destructive",
};

/** Honest customer-facing message for a template we can't run right now. */
export function unavailableMessage(status: HealthStatus, eta?: string | null): string {
  if (status === "broken") {
    return eta
      ? `This source is temporarily unavailable — we're on it. Expected back: ${eta}.`
      : "This source is temporarily unavailable and we've disabled it so you don't spend credits on an empty list.";
  }
  if (status === "degraded") {
    return "This source is returning less contact data than usual right now, so expect a lower fill rate.";
  }
  return "";
}
