/**
 * Marketplace Deals persistence. Reads and writes go through the caller's
 * Supabase client so RLS scopes every row to their workspace — never admin.
 */
import { EMPTY_CRITERIA, type MarketplaceCriteria } from "./catalog.shared";
import { DEFAULT_MIN_MATCH_SCORE } from "./match.shared";
import { DEFAULT_CHECK_INTERVAL_SECONDS, normalizeInterval } from "./monitor.shared";

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
  /** Minimum Match Score a listing must reach before it alerts. */
  minMatchScore: number;
  notifyInApp: boolean;
  notifyEmail: boolean;
  matchesFound: number;
  attentionNote: string | null;
  createdAt: string;
  /** Monitoring schedule + health, straight from the run bookkeeping. */
  checkIntervalSeconds: number;
  baselineState: "pending" | "established";
  baselineAt: string | null;
  baselineCount: number;
  alertExistingMatches: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  rateLimitedUntil: string | null;
  lastAlertedAt: string | null;
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
    minMatchScore: r.min_match_score ?? DEFAULT_MIN_MATCH_SCORE,
    notifyInApp: r.notify_in_app ?? true,
    notifyEmail: r.notify_email ?? false,
    matchesFound: r.matches_found ?? 0,
    attentionNote: r.attention_note ?? null,
    createdAt: r.created_at,
    checkIntervalSeconds: r.check_interval_seconds ?? DEFAULT_CHECK_INTERVAL_SECONDS,
    baselineState: (r.baseline_state ?? "pending") as "pending" | "established",
    baselineAt: r.baseline_at ?? null,
    baselineCount: r.baseline_count ?? 0,
    alertExistingMatches: r.alert_existing_matches ?? false,
    lastSuccessAt: r.last_success_at ?? null,
    lastError: r.last_error ?? null,
    lastErrorAt: r.last_error_at ?? null,
    consecutiveFailures: r.consecutive_failures ?? 0,
    rateLimitedUntil: r.rate_limited_until ?? null,
    lastAlertedAt: r.last_alerted_at ?? null,
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
    minMatchScore?: number;
    notifyInApp?: boolean;
    notifyEmail?: boolean;
    checkIntervalSeconds?: number;
    alertExistingMatches?: boolean;
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
      min_match_score: input.minMatchScore ?? DEFAULT_MIN_MATCH_SCORE,
      notify_in_app: input.notifyInApp ?? true,
      notify_email: input.notifyEmail ?? false,
      check_interval_seconds: normalizeInterval(input.checkIntervalSeconds),
      alert_existing_matches: input.alertExistingMatches ?? false,
      // A brand new search always takes a baseline before it alerts.
      baseline_state: "pending",
      // Due immediately: the first check establishes the baseline.
      next_check_at: new Date().toISOString(),
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
  minMatchScore?: number;
  notifyInApp?: boolean;
  notifyEmail?: boolean;
  status?: string;
  checkIntervalSeconds?: number;
  alertExistingMatches?: boolean;
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
  if (patch.minMatchScore !== undefined) payload.min_match_score = patch.minMatchScore;
  if (patch.notifyInApp !== undefined) payload.notify_in_app = patch.notifyInApp;
  if (patch.notifyEmail !== undefined) payload.notify_email = patch.notifyEmail;
  if (patch.checkIntervalSeconds !== undefined) {
    payload.check_interval_seconds = normalizeInterval(patch.checkIntervalSeconds);
    // A frequency change takes effect on the next tick, not in an hour.
    payload.next_check_at = new Date().toISOString();
  }
  if (patch.alertExistingMatches !== undefined) {
    payload.alert_existing_matches = patch.alertExistingMatches;
  }
  if (patch.status !== undefined) {
    payload.status = patch.status;
    // Resuming clears the failure streak so health reflects real evidence again.
    if (patch.status === "active") {
      payload.consecutive_failures = 0;
      payload.last_error = null;
      payload.next_check_at = new Date().toISOString();
    }
  }

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
    minMatchScore: row.minMatchScore,
    notifyInApp: row.notifyInApp,
    notifyEmail: row.notifyEmail,
    checkIntervalSeconds: row.checkIntervalSeconds,
    alertExistingMatches: row.alertExistingMatches,
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
