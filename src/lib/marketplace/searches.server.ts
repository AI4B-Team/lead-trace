/**
 * Marketplace Deals persistence. Reads and writes go through the caller's
 * Supabase client so RLS scopes every row to their workspace — never admin.
 */
import { EMPTY_CRITERIA, type MarketplaceCriteria } from "./catalog.shared";

export type MarketplaceSearchRow = {
  id: string;
  name: string;
  category: string;
  prompt: string;
  criteria: MarketplaceCriteria;
  sources: string[];
  location: string | null;
  radiusMiles: number | null;
  status: string;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  alertThreshold: number;
  notifyInApp: boolean;
  notifyEmail: boolean;
  matchesFound: number;
  attentionNote: string | null;
  createdAt: string;
};

type Client = { from: (t: string) => any };

function toRow(r: any): MarketplaceSearchRow {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    prompt: r.prompt ?? "",
    criteria: { ...EMPTY_CRITERIA, ...(r.criteria ?? {}) },
    sources: r.sources ?? [],
    location: r.location ?? null,
    radiusMiles: r.radius_miles ?? null,
    status: r.status,
    lastCheckedAt: r.last_checked_at ?? null,
    nextCheckAt: r.next_check_at ?? null,
    alertThreshold: r.alert_threshold ?? 1,
    notifyInApp: r.notify_in_app ?? true,
    notifyEmail: r.notify_email ?? false,
    matchesFound: r.matches_found ?? 0,
    attentionNote: r.attention_note ?? null,
    createdAt: r.created_at,
  };
}

export async function insertSearch(
  supabase: Client,
  userId: string,
  input: {
    workspaceId: string;
    name: string;
    category: string;
    prompt: string;
    criteria: MarketplaceCriteria;
    sources: string[];
    location: string | null;
    radiusMiles: number | null;
    alertThreshold?: number;
    notifyInApp?: boolean;
    notifyEmail?: boolean;
  },
): Promise<MarketplaceSearchRow> {
  const { data, error } = await supabase
    .from("marketplace_searches")
    .insert({
      workspace_id: input.workspaceId,
      created_by: userId,
      name: input.name,
      category: input.category,
      prompt: input.prompt,
      criteria: input.criteria,
      sources: input.sources,
      location: input.location,
      radius_miles: input.radiusMiles,
      alert_threshold: input.alertThreshold ?? 1,
      notify_in_app: input.notifyInApp ?? true,
      notify_email: input.notifyEmail ?? false,
      status: "active",
    })
    .select("*")
    .single();
  // Never fake success: surface the real persistence failure to the caller.
  if (error || !data) throw new Error(error?.message ?? "Could not save this marketplace search.");
  return toRow(data);
}

export async function listSearches(
  supabase: Client,
  workspaceId: string,
): Promise<MarketplaceSearchRow[]> {
  const { data, error } = await supabase
    .from("marketplace_searches")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRow);
}

export type SearchPatch = {
  name?: string;
  category?: string;
  prompt?: string;
  criteria?: MarketplaceCriteria;
  sources?: string[];
  location?: string | null;
  radiusMiles?: number | null;
  alertThreshold?: number;
  notifyInApp?: boolean;
  notifyEmail?: boolean;
  status?: string;
};

/** Edit in place — a search is never recreated to change its definition. */
export async function updateSearch(
  supabase: Client,
  id: string,
  workspaceId: string,
  patch: SearchPatch,
): Promise<MarketplaceSearchRow> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.prompt !== undefined) payload.prompt = patch.prompt;
  if (patch.criteria !== undefined) payload.criteria = patch.criteria;
  if (patch.sources !== undefined) payload.sources = patch.sources;
  if (patch.location !== undefined) payload.location = patch.location;
  if (patch.radiusMiles !== undefined) payload.radius_miles = patch.radiusMiles;
  if (patch.alertThreshold !== undefined) payload.alert_threshold = patch.alertThreshold;
  if (patch.notifyInApp !== undefined) payload.notify_in_app = patch.notifyInApp;
  if (patch.notifyEmail !== undefined) payload.notify_email = patch.notifyEmail;
  if (patch.status !== undefined) payload.status = patch.status;

  const { data, error } = await supabase
    .from("marketplace_searches")
    .update(payload)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update this marketplace search.");
  return toRow(data);
}

export async function duplicateSearch(
  supabase: Client,
  userId: string,
  id: string,
  workspaceId: string,
): Promise<MarketplaceSearchRow> {
  const { data: src, error } = await supabase
    .from("marketplace_searches")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !src) throw new Error(error?.message ?? "That marketplace search no longer exists.");
  const row = toRow(src);
  return insertSearch(supabase, userId, {
    workspaceId,
    name: `${row.name} (Copy)`,
    category: row.category,
    prompt: row.prompt,
    criteria: row.criteria,
    sources: row.sources,
    location: row.location,
    radiusMiles: row.radiusMiles,
    alertThreshold: row.alertThreshold,
    notifyInApp: row.notifyInApp,
    notifyEmail: row.notifyEmail,
  });
}

/** Soft delete: the row is archived so ledger/history references stay intact. */
export async function deleteSearch(
  supabase: Client,
  id: string,
  workspaceId: string,
): Promise<{ ok: true }> {
  const { error } = await supabase
    .from("marketplace_searches")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
