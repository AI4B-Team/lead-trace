/**
 * Marketplace Deals — SLOW PATH.
 *
 * Everything expensive lives here: AI attribute extraction for criteria the
 * deterministic pass could not resolve, and Comparable Listings. It runs AFTER
 * the alert has already gone out, because discovery speed beats valuation.
 *
 * It never sends a new "new match" alert; alerts belong to the fast path.
 */
import { reanalyzeStoredListing } from "./analyze.server";

type Client = { from: (t: string) => any };

export type EnrichmentSummary = {
  processed: number;
  reanalyzed: number;
  compsComputed: number;
  errors: number;
  firstError?: string;
};

/**
 * Process the pending enrichment queue, strongest matches first — a 97% match
 * gets its comps before a borderline one.
 */
export async function runEnrichmentQueue(limit = 20): Promise<EnrichmentSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = supabaseAdmin as unknown as Client;

  const { data, error } = await supabaseAdmin
    .from("marketplace_listings")
    .select("id, workspace_id, match_score, disqualified_reason")
    .eq("enrichment_state", "pending")
    .order("match_score", { ascending: false })
    .order("first_seen_at", { ascending: true })
    .limit(limit);
  if (error) return { processed: 0, reanalyzed: 0, compsComputed: 0, errors: 1, firstError: error.message };

  const summary: EnrichmentSummary = { processed: 0, reanalyzed: 0, compsComputed: 0, errors: 0 };
  for (const row of data ?? []) {
    summary.processed += 1;
    const listingId = (row as any).id as string;
    const workspaceId = (row as any).workspace_id as string;
    await supabaseAdmin
      .from("marketplace_listings")
      .update({ enrichment_state: "running" })
      .eq("id", listingId);

    // Disqualified listings are never enriched: money is not spent on a row the
    // filters already rejected.
    if ((row as any).disqualified_reason) {
      await supabaseAdmin
        .from("marketplace_listings")
        .update({ enrichment_state: "skipped", enriched_at: new Date().toISOString() })
        .eq("id", listingId);
      continue;
    }

    try {
      // Deeper analysis (AI allowed) — may raise or lower the Match Score.
      await reanalyzeStoredListing(supabase, workspaceId, listingId);
      summary.reanalyzed += 1;
      // Comparable Listings, cached by the comps engine itself.
      const { checkComps } = await import("./comps.server");
      await checkComps(supabase, workspaceId, listingId, {});
      summary.compsComputed += 1;
      await supabaseAdmin
        .from("marketplace_listings")
        .update({ enrichment_state: "done", enriched_at: new Date().toISOString() })
        .eq("id", listingId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enrichment failed.";
      summary.errors += 1;
      summary.firstError ??= message;
      console.error(`[marketplace] enrichment failed for ${listingId}:`, message);
      await supabaseAdmin
        .from("marketplace_listings")
        .update({ enrichment_state: "error", enriched_at: new Date().toISOString() })
        .eq("id", listingId);
    }
  }
  return summary;
}
