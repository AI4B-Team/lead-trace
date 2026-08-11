/**
 * State-level Distress Feed content — browser-safe shapes and helpers.
 *
 * Editorial copy lives in the state_guides table, never in JSX, so it can be
 * corrected without a deploy. Anything unpublished is noindex and stays out of
 * the sitemap: a half-empty templated page is an SEO liability, not an asset.
 */

import { RECORD_TYPES } from "./distress-feed.shared";
import { US_STATES } from "./us-geo";

export type StateGuideStep = { heading?: string; body: string };
export type StateGuideFaq = { question: string; answer: string };

export type StateGuideRow = {
  id: string;
  state: string;
  record_type_slug: string;
  published: boolean;
  title: string | null;
  intro: string | null;
  law_sale_type: string | null;
  law_records_holder: string | null;
  law_claim_window: string | null;
  law_local_terminology: string | null;
  law_public_records_statute: string | null;
  law_notes: string | null;
  steps: StateGuideStep[];
  faqs: StateGuideFaq[];
  what_is_body: string | null;
  how_pros_use_body: string | null;
  updated_at: string;
};

export type StateTypeStats = {
  counties_covered: number;
  records: number;
  latest_filed: string | null;
  last_pull_at: string | null;
  amount_records: number;
  total_amount: number | null;
};

export const STATES_PATH = "/distress-feed/states";

export function stateHubPath(state: string): string {
  return `${STATES_PATH}/${state.toLowerCase()}`;
}
export function stateTypePath(state: string, recordTypeSlug: string): string {
  return `${STATES_PATH}/${state.toLowerCase()}/${recordTypeSlug}`;
}

export function stateName(code: string): string {
  const c = code.toUpperCase();
  return US_STATES.find((s) => s.code === c)?.name ?? c;
}

/** Record types whose filings carry a dollar figure worth totalling. */
const AMOUNT_TYPES = new Set([
  "surplus-funds",
  "tax-deed",
  "tax-liens",
  "tax-delinquent",
  "liens",
  "pre-foreclosure",
]);

export function carriesAmount(recordTypeSlug: string): boolean {
  return AMOUNT_TYPES.has(recordTypeSlug);
}

/** slug → the record_type id stored on distress_records. */
export function recordTypeIdForSlug(slug: string): string | null {
  return RECORD_TYPES.find((r) => r.slug === slug)?.id ?? null;
}

export function truncate(value: string, max = 155): string {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

export const LEGAL_DISCLAIMER =
  "This is general information, not legal advice. Verify current statute text before acting.";
