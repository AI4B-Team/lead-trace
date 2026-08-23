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
