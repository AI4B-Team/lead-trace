/**
 * State-level content — server-only reads.
 *
 * Public reads use the publishable-key client and are limited by RLS to
 * published rows. Admin reads use the service client so unpublished drafts are
 * editable in the console.
 */

import { publicClient } from "./distress-feed.server";
import type { StateGuideRow, StateTypeStats } from "./state-guides.shared";

const COLUMNS =
  "id, state, record_type_slug, published, title, intro, law_sale_type, law_records_holder, law_claim_window, law_local_terminology, law_public_records_statute, law_notes, steps, faqs, what_is_body, how_pros_use_body, updated_at";

/** Every PUBLISHED state guide, optionally narrowed to one state or type. */
export async function listPublishedStateGuides(
  opts: {
    state?: string;
    recordTypeSlug?: string;
  } = {},
): Promise<StateGuideRow[]> {
  const supabase = publicClient();
  let q = supabase.from("state_guides").select(COLUMNS).eq("published", true).order("state");
  if (opts.state) q = q.ilike("state", opts.state);
  if (opts.recordTypeSlug) q = q.eq("record_type_slug", opts.recordTypeSlug);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StateGuideRow[];
}

/** One published state guide, or null when it does not exist or is a draft. */
export async function getPublishedStateGuide(
  state: string,
  recordTypeSlug: string,
): Promise<StateGuideRow | null> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("state_guides")
    .select(COLUMNS)
    .ilike("state", state)
    .eq("record_type_slug", recordTypeSlug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as StateGuideRow) ?? null;
}

/** Live figures for the "By The Numbers" block. Never editorial, never cached. */
export async function stateTypeStats(state: string, recordTypeId: string): Promise<StateTypeStats> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("distress_state_type_stats", {
    _state: state.toUpperCase(),
    _record_type: recordTypeId,
  } as never);
  if (error) throw new Error(error.message);
  const row = (data as unknown as StateTypeStats[] | null)?.[0];
  return {
    counties_covered: Number(row?.counties_covered ?? 0),
    records: Number(row?.records ?? 0),
    latest_filed: row?.latest_filed ?? null,
    last_pull_at: row?.last_pull_at ?? null,
    amount_records: Number(row?.amount_records ?? 0),
    total_amount: row?.total_amount == null ? null : Number(row.total_amount),
  };
}

/** Admin: every row, drafts included. */
export async function listAllStateGuides(): Promise<StateGuideRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("state_guides")
    .select(COLUMNS)
    .order("state")
    .order("record_type_slug");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StateGuideRow[];
}

/** Per-county record counts for one state and one record type, for the county table. */
export type StateTypeCounty = {
  county: string;
  records: number;
  latest_filed: string | null;
  last_pull_at: string | null;
};

export async function stateTypeCounties(
  state: string,
  recordTypeId: string,
): Promise<StateTypeCounty[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("distress_state_type_counties", {
    _state: state.toUpperCase(),
    _record_type: recordTypeId,
  } as never);
  if (error) throw new Error(error.message);
  const rows = (data as unknown as StateTypeCounty[] | null) ?? [];
  return rows.map((r) => ({ ...r, records: Number(r.records ?? 0) }));
}
