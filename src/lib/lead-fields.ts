// ---------------------------------------------------------------------------
// One field registry for every lead table.
//
// Two tables read from it, keyed off different things on purpose:
//   - a single run's results page is SCHEMA-driven (one run = one output shape,
//     so the template decides which columns exist), and
//   - the Leads aggregate is DATA-driven (a deduplicated contact spans many
//     lists with different shapes, so columns follow what's actually present
//     in the current filtered view).
//
// Reachability stays limited to the three channels we can lawfully contact:
// phone/SMS, email, mailing address. Website and social handles are display /
// enrichment fields — they never earn a "reachable by" count or a campaign
// channel, because you can't contact a URL.
// ---------------------------------------------------------------------------

import { enrichmentProfile, type EnrichmentProfile } from "@/lib/pipeline-options";

export type LeadFieldKind = "outreach" | "display";

export type KnownLeadFieldKey =
  | "name"
  | "business"
  | "handle"
  | "platform"
  | "followers"
  | "engagement"
  | "location"
  | "phone"
  | "email"
  | "address"
  | "website"
  | "record_type"
  | "county"
  | "surplus_amount"
  | "sale_date"
  | "escheat_date";

/**
 * Field keys are NOT a closed enum. Built-in templates use registry keys;
 * custom/requested scrapes contribute keys nobody shipped code for (parcel_id,
 * tax_amount, …). Both flow through the same renderer.
 */
export type LeadFieldKey = KnownLeadFieldKey | (string & {});

export type LeadFieldRow = Record<string, unknown> & {
  source_meta?: unknown;
};

/**
 * How a display value should be rendered. Amount-driven lead types (surplus /
 * distress) carry currency, dates and an escheat countdown that read as noise
 * when printed raw — the table uses this hint to format them properly.
 */
export type LeadFieldFormat = "currency" | "date" | "escheat";

export type LeadField = {
  key: LeadFieldKey;
  label: string;
  kind: LeadFieldKind;
  /** Outreach channel this field maps to, when it is one. */
  channel?: "phone" | "email" | "address";
  /** Presentation hint for the renderer; plain text when omitted. */
  format?: LeadFieldFormat;
  /** Raw display value for this row, or null when the record has none. */
  value: (row: LeadFieldRow) => string | null;
};

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const meta = (row: LeadFieldRow): Record<string, unknown> =>
  row.source_meta && typeof row.source_meta === "object" ? (row.source_meta as Record<string, unknown>) : {};

const socials = (row: LeadFieldRow): Record<string, unknown> =>
  row.socials && typeof row.socials === "object" ? (row.socials as Record<string, unknown>) : {};

const firstOf = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return null;
};

/** Every field the app knows how to show, defined exactly once. */
export const LEAD_FIELDS: Record<KnownLeadFieldKey, LeadField> = {
  name: { key: "name", label: "Name", kind: "display", value: (r) => str(r.full_name) },
  business: { key: "business", label: "Business", kind: "display", value: (r) => str(r.business_name) },
  handle: {
    key: "handle",
    label: "Handle",
    kind: "display",
    // Identity, not a fallback for a name: if a run yielded no handle the
    // column has to stay absent, or every business row would fake one.
    value: (r) =>
      firstOf(r.handle, meta(r).handle, meta(r).username, socials(r).instagram, socials(r).tiktok),
  },
  platform: {
    key: "platform",
    label: "Platform",
    kind: "display",
    value: (r) => firstOf(r.platform, meta(r).platform),
  },
  followers: {
    key: "followers",
    label: "Followers",
    kind: "display",
    value: (r) => firstOf(r.followers, meta(r).followers, meta(r).follower_count),
  },
  engagement: {
    key: "engagement",
    label: "Engagement",
    kind: "display",
    value: (r) => firstOf(r.engagement, meta(r).engagement, meta(r).engagement_rate),
  },
  location: {
    key: "location",
    label: "Location",
    kind: "display",
    value: (r) => [str(r.city), str(r.state)].filter(Boolean).join(", ") || null,
  },
  phone: { key: "phone", label: "Phone", kind: "outreach", channel: "phone", value: (r) => str(r.phone) },
  email: { key: "email", label: "Email", kind: "outreach", channel: "email", value: (r) => firstOf(r.email, meta(r).email) },
  address: { key: "address", label: "Address", kind: "outreach", channel: "address", value: (r) => str(r.address) },
  website: {
    key: "website",
    label: "Website",
    kind: "display",
    value: (r) => firstOf(r.website, meta(r).website, meta(r).profile_url, meta(r).url),
  },
  // Amount-driven lead types (surplus funds / distress). These live in
  // source_meta, so they are display-only and formatted via the `format` hint.
  record_type: {
    key: "record_type",
    label: "Record Type",
    kind: "display",
    value: (r) => str(meta(r).record_type),
  },
  county: {
    key: "county",
    label: "County",
    kind: "display",
    value: (r) => str(meta(r).county),
  },
  surplus_amount: {
    key: "surplus_amount",
    label: "Surplus",
    kind: "display",
    format: "currency",
    value: (r) => str(meta(r).surplus_amount),
  },
  sale_date: {
    key: "sale_date",
    label: "Sale Date",
    kind: "display",
    format: "date",
    value: (r) => firstOf(meta(r).sale_date, meta(r).auction_date),
  },
  escheat_date: {
    key: "escheat_date",
    label: "Escheat",
    kind: "display",
    format: "escheat",
    value: (r) => str(meta(r).escheat_date),
  },
};

/** The three real outreach channels. Website/social are deliberately absent. */
export const OUTREACH_FIELD_KEYS: KnownLeadFieldKey[] = ["phone", "email", "address"];

/** Output shape per enrichment profile — a run yields exactly these fields. */
const FIELDS_BY_PROFILE: Record<EnrichmentProfile, KnownLeadFieldKey[]> = {
  creator: ["handle", "platform", "followers", "engagement", "email", "website"],
  seller: ["business", "website", "email"],
  b2b: ["name", "business", "email", "phone"],
  portal: ["name", "address", "phone", "email"],
  data: ["business", "website", "location"],
  standard: ["name", "business", "location", "phone", "email", "address"],
};

/**
 * Candidate columns for the aggregate Leads table, in display order. Every
 * profile-specific field is a candidate; presence in the current filtered view
 * decides which ones actually render.
 */
export const AGGREGATE_CANDIDATE_KEYS: KnownLeadFieldKey[] = [
  "handle",
  "platform",
  "followers",
  "engagement",
  "phone",
  "email",
  "address",
  "website",
  // Amount-driven lead types — surface only when the filtered view has them.
  "record_type",
  "county",
  "surplus_amount",
  "sale_date",
  "escheat_date",
];

/** Site scrapers take a URL in and hand back a business + its contact page. */
const URL_SCRAPER_IDS = new Set(["contact-details", "universal-crawl", "web-scraper", "site-crawler"]);

const FIELDS_BY_TEMPLATE: Record<string, KnownLeadFieldKey[]> = {
  probate: ["name", "address", "phone"],
  "google-maps": ["business", "location", "phone", "website", "email"],
  yelp: ["business", "location", "phone", "website", "email"],
};

/**
 * A custom scrape's declared output schema, stored on the run/template record
 * when a requested adapter is built. Keys are unknown to this file by design.
 */
export type CustomFieldSchema = Array<
  { key: string; label?: string | null; type?: string | null; kind?: string | null }
>;

/** Keys the registry already reads (directly or as an alias) — never re-derived. */
const CLAIMED_META_KEYS = new Set([
  "handle", "username", "platform", "followers", "follower_count", "engagement",
  "engagement_rate", "email", "website", "url", "profile_url", "phone", "address",
  "city", "state", "zip", "name", "full_name", "business", "business_name",
  // Claimed by the amount-driven registry fields above (some via aliases), so
  // discovery never renders a second raw copy of them.
  "record_type", "county", "surplus_amount", "sale_date", "auction_date", "escheat_date",
]);

/** Structural noise that is never a user-facing column. */
const NOISE_META_KEYS = new Set([
  "id", "raw", "html", "body", "source", "source_id", "scraped_at", "row_index",
  // Internal distress/surplus plumbing — not customer-facing columns. The
  // surplus facts worth showing are promoted to registry fields above.
  "fips", "doc_number", "filed_date", "parcel_apn", "amount",
  "mailing_address", "mailing_city", "mailing_state", "mailing_zip",
  "surplus_basis", "case_status", "disbursement_status", "provider", "rf_hash", "realeflow",
]);

const humanize = (key: string): string =>
  key
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ") || key;

/**
 * Minimal classification for a field nobody shipped code for: only the three
 * lawful outreach channels are detected (so reachability and campaign
 * eligibility keep working); everything else is display-only. Websites and
 * socials stay display-only on purpose — you can't contact a URL.
 */
export function classifyFieldKey(key: string, declaredType?: string | null): Pick<LeadField, "kind" | "channel"> {
  const k = `${key} ${declaredType ?? ""}`.toLowerCase();
  if (/(website|url|instagram|facebook|linkedin|tiktok|twitter|handle|social|profile)/.test(k)) {
    return { kind: "display" };
  }
  if (/(^|[^a-z])(phone|mobile|cell|tel|telephone|sms)([^a-z]|$)/.test(k)) return { kind: "outreach", channel: "phone" };
  if (/e-?mail/.test(k)) return { kind: "outreach", channel: "email" };
  if (/(address|mailing|street)/.test(k)) return { kind: "outreach", channel: "address" };
  return { kind: "display" };
}

/** Build a renderable field for a key this codebase has never seen. */
export function customField(key: string, label?: string | null, declaredType?: string | null): LeadField {
  const classified = classifyFieldKey(key, declaredType);
  return {
    key,
    label: label?.trim() || humanize(key),
    ...classified,
    value: (r) => firstOf((r as Record<string, unknown>)[key], meta(r)[key]),
  };
}

/** Fields from an explicit custom output schema. */
export function schemaFields(schema?: CustomFieldSchema | null): LeadField[] {
  if (!schema?.length) return [];
  const seen = new Set<string>();
  const out: LeadField[] = [];
  for (const f of schema) {
    const key = typeof f === "string" ? f : f?.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(customField(key, typeof f === "string" ? null : f.label, typeof f === "string" ? null : (f.type ?? f.kind)));
  }
  return out;
}

/**
 * Infer columns from the rows themselves, so a custom scrape's output surfaces
 * before any formal schema is attached to it.
 */
export function discoverFields(rows: LeadFieldRow[], exclude: Iterable<string> = []): LeadField[] {
  const taken = new Set<string>([...CLAIMED_META_KEYS, ...NOISE_META_KEYS, ...exclude]);
  const keys: string[] = [];
  for (const row of rows) {
    for (const [k, v] of Object.entries(meta(row))) {
      if (!k || k.startsWith("_") || taken.has(k)) continue;
      if (v == null || typeof v === "object") continue;
      if (!String(v).trim()) continue;
      taken.add(k);
      keys.push(k);
    }
  }
  return keys.sort((a, b) => a.localeCompare(b)).map((k) => customField(k));
}

/**
 * Columns a given run's results table should render: registry fields for the
 * template it ran, plus whatever that run's own schema/data declares. A brand
 * new custom scrape therefore needs zero table code.
 */
export function resultFieldsForTemplate(
  templateId?: string | null,
  rows: LeadFieldRow[] = [],
  schema?: CustomFieldSchema | null,
): LeadField[] {
  const keys = templateId && FIELDS_BY_TEMPLATE[templateId]
    ? FIELDS_BY_TEMPLATE[templateId]
    : templateId && URL_SCRAPER_IDS.has(templateId)
      ? (["business", "website", "email"] as KnownLeadFieldKey[])
      : FIELDS_BY_PROFILE[enrichmentProfile(templateId)];
  const base = keys.map((k) => LEAD_FIELDS[k]);
  const declared = schemaFields(schema);
  const known = new Set([...base, ...declared].map((f) => f.key));
  return [...base, ...declared, ...discoverFields(rows, known)];
}

/** Keep only the schema fields this run actually populated. */
export function populatedFields(fields: LeadField[], rows: LeadFieldRow[]): LeadField[] {
  if (rows.length === 0) return fields;
  return fields.filter((f) => rows.some((r) => f.value(r) !== null));
}

/**
 * Data-driven columns for the deduplicated Leads master: the union of fields
 * present anywhere in the current filtered view, so a narrowed filter never
 * leaves a wall of dashes.
 */
export function presentFieldKeys(rows: LeadFieldRow[], candidates: KnownLeadFieldKey[]): Set<KnownLeadFieldKey> {
  const present = new Set<KnownLeadFieldKey>();
  for (const key of candidates) {
    const field = LEAD_FIELDS[key];
    if (rows.some((r) => field.value(r) !== null)) present.add(key);
  }
  return present;
}

/**
 * Columns for the deduplicated Leads master: registry candidates present in the
 * current filtered view, followed by any novel fields custom scrapes
 * contributed. Unrecognized fields render as display columns; they can never
 * break the table because nothing looks them up by name.
 */
export function aggregateFields(rows: LeadFieldRow[]): LeadField[] {
  if (rows.length === 0) return [LEAD_FIELDS.phone, LEAD_FIELDS.email];
  const present = presentFieldKeys(rows, AGGREGATE_CANDIDATE_KEYS);
  const base = AGGREGATE_CANDIDATE_KEYS.filter((k) => present.has(k)).map((k) => LEAD_FIELDS[k]);
  const custom = discoverFields(rows, base.map((f) => f.key));
  return [...base, ...custom];
}