/**
 * Record types the pipeline can actually fulfill today. Adding a new wedge
 * (permits, business registrations, licenses) means adding a row here — the
 * List Builder dropdown renders straight off this config.
 */
export type RecordTypeCategory = "real_estate_distress" | "permits" | "business_registration" | "licensing";

export type RecordTypeOption = {
  id: string;
  label: string;
  category: RecordTypeCategory;
};

export const RECORD_TYPE_OPTIONS: readonly RecordTypeOption[] = [
  { id: "probate", label: "Probate", category: "real_estate_distress" },
  { id: "code_violation", label: "Code Violation", category: "real_estate_distress" },
  { id: "pre_foreclosure", label: "Pre-Foreclosure / Lis Pendens", category: "real_estate_distress" },
  { id: "tax_default", label: "Tax Default / Delinquency", category: "real_estate_distress" },
  { id: "vacancy", label: "Vacancy / Demolition Notice", category: "real_estate_distress" },
  { id: "eviction", label: "Eviction", category: "real_estate_distress" },
  { id: "surplus_funds", label: "Surplus Funds / Excess Proceeds", category: "real_estate_distress" },
];

/** Every canonical slug. Slugs are the ONLY join key for record types. */
export const RECORD_TYPE_SLUGS: readonly string[] = RECORD_TYPE_OPTIONS.map((r) => r.id);

/**
 * Slug → display name, sourced from the record_types table when rows are
 * available and falling back to the compiled options above (same slugs, same
 * names) when they are not — server code and prerender have no query in hand.
 *
 * Every user-facing record-type label goes through here. Nothing compares
 * display names: two lists that agreed on meaning but not word order
 * ("Pre-Foreclosure / Lis Pendens" vs "Lis Pendens / Pre-Foreclosure") were
 * string-unequal, which is the bug class this removes.
 */
export function recordTypeDisplayName(
  slug: string | null | undefined,
  rows?: ReadonlyArray<{ slug: string; name: string }> | null,
): string {
  const key = recordTypeId(slug) ?? (slug ?? "").trim().toLowerCase();
  if (!key) return "";
  const row = rows?.find((r) => r.slug === key);
  if (row?.name) return row.name;
  const option = RECORD_TYPE_OPTIONS.find((r) => r.id === key);
  if (option) return option.label;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Labels only, for prompts and legacy call sites that key off the label. */
export const RECORD_TYPE_LABELS: readonly string[] = RECORD_TYPE_OPTIONS.map((r) => r.label);

/** Sentinel value used by the dropdown's "Request A Record Type…" affordance. */
export const REQUEST_RECORD_TYPE = "__request_record_type__";

/**
 * The source template that actually serves each record type. The Source row and
 * the Record Type row describe the SAME job, so changing one must move the
 * other — otherwise the spec reads as two different jobs.
 */
const TEMPLATE_BY_RECORD_TYPE: Record<string, string> = {
  probate: "probate",
  code_violation: "code",
  pre_foreclosure: "prefc",
  tax_default: "tax",
  vacancy: "vacancy",
};

export function templateForRecordType(label: string | null | undefined): string | null {
  const slug = recordTypeId(label);
  return (slug && TEMPLATE_BY_RECORD_TYPE[slug]) || null;
}

/**
 * Every template that exists to serve a single record type. Health checks group
 * these by the data path that actually fulfils them, so the list has to come
 * from this map rather than a second hand-written copy.
 */
export const RECORD_TYPE_TEMPLATE_IDS: readonly string[] = Object.values(TEMPLATE_BY_RECORD_TYPE);

/**
 * One canonical spelling for a record type: the option LABEL.
 *
 * The model, the seed data and older specs all write this field differently
 * ("code_violation", "Code Violations", "lis pendens"). The panel's dropdown
 * keys off the label, so an id-shaped value rendered as an EMPTY select while
 * the List Assembled card happily displayed it — two controls reading the same
 * spec and disagreeing. Canonicalising at the spec boundary removes the class
 * of bug rather than patching one control.
 */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Slash-joined labels are the same type whichever half is written first:
 * "Lis Pendens / Pre-Foreclosure" and "Pre-Foreclosure / Lis Pendens" once
 * string-compared unequal and quietly split the record-type lists in two.
 * Sorting the halves makes word order irrelevant instead of asking every
 * caller to spell the label the same way.
 */
function orderlessKey(value: string): string {
  return value
    .split("/")
    .map((part) => key(part))
    .filter(Boolean)
    .sort()
    .join("|");
}

const RECORD_TYPE_ALIASES: Record<string, string> = {
  probates: "Probate",
  probatelead: "Probate",
  codeviolations: "Code Violation",
  codeenforcement: "Code Violation",
  codecase: "Code Violation",
  preforeclosure: "Pre-Foreclosure / Lis Pendens",
  preforeclosures: "Pre-Foreclosure / Lis Pendens",
  lispendens: "Pre-Foreclosure / Lis Pendens",
  foreclosure: "Pre-Foreclosure / Lis Pendens",
  taxdelinquent: "Tax Default / Delinquency",
  taxdelinquency: "Tax Default / Delinquency",
  taxdefault: "Tax Default / Delinquency",
  taxlien: "Tax Default / Delinquency",
  tax: "Tax Default / Delinquency",
  taxdeed: "Tax Default / Delinquency",
  vacancy: "Vacancy / Demolition Notice",
  vacant: "Vacancy / Demolition Notice",
  demolition: "Vacancy / Demolition Notice",
  evictions: "Eviction",
  surplus: "Surplus Funds / Excess Proceeds",
  surplusfunds: "Surplus Funds / Excess Proceeds",
  excessproceeds: "Surplus Funds / Excess Proceeds",
  unclaimedsurplus: "Surplus Funds / Excess Proceeds",
};

export function canonicalRecordType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = key(raw);
  if (!k) return null;
  const hit = RECORD_TYPE_OPTIONS.find((r) => key(r.id) === k || key(r.label) === k);
  if (hit) return hit.label;
  if (RECORD_TYPE_ALIASES[k]) return RECORD_TYPE_ALIASES[k]!;
  const ok = orderlessKey(raw);
  return RECORD_TYPE_OPTIONS.find((r) => orderlessKey(r.label) === ok)?.label ?? null;
}

/** Database/source_coverage key for any accepted record-type spelling. */
export function recordTypeId(raw: string | null | undefined): string | null {
  const canonical = canonicalRecordType(raw);
  return canonical ? RECORD_TYPE_OPTIONS.find((r) => r.label === canonical)?.id ?? null : null;
}

/**
 * The picker's canonical slug → every spelling `distress_records.record_type`
 * (and therefore `source_coverage.record_type`) actually stores for it. Ingest
 * paths wrote provider-native names ("tax_lien", "tax_deed") for what the picker
 * calls Tax Default, so one canonical slug has to match several stored slugs.
 *
 * This is the single source of truth for that mapping — the row reader
 * (`pullDistressRecords`) AND the coverage gate both read from here, so the two
 * can never drift and quietly gate out a type that has live rows.
 */
const RECORD_TYPE_STORED_SLUGS: Record<string, string[]> = {
  tax_default: ["tax_default", "tax_lien", "tax_deed", "tax_delinquent"],
  pre_foreclosure: ["pre_foreclosure", "lis_pendens", "foreclosure_auction"],
};

/**
 * All the slugs a record type may be stored under, for any accepted spelling.
 * Falls back to the canonical slug itself when there is no divergence.
 */
export function storedSlugsForRecordType(raw: string | null | undefined): string[] {
  const slug = recordTypeId(raw) ?? (raw ?? "").trim().toLowerCase();
  if (!slug) return [];
  return RECORD_TYPE_STORED_SLUGS[slug] ?? [slug];
}
/**
 * The record type a public-records template pulls. Template cards are gated on
 * verified coverage for this label, so a filing with no verified county
 * anywhere renders as "Coming Soon" instead of a runnable free template.
 */
export function recordTypeForTemplate(templateId: string | null | undefined): string | null {
  if (!templateId) return null;
  const hit = Object.entries(TEMPLATE_BY_RECORD_TYPE).find(([, id]) => id === templateId);
  // Returns the SLUG: coverage lookups join on slug, never on display name.
  return hit ? hit[0] : null;
}
