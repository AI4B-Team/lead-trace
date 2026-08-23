/**
 * Marketplace Deals — monitoring engine (FAST PATH).
 *
 * Flow, per scheduled check:
 *   Marketplace Search → Scheduled Source Check → Retrieve Current Listings →
 *   Normalize → Compare Against Previously Seen → Identify New → Apply Filters →
 *   Analyze Candidates → Calculate Match Score → Store Qualified Match → Alert
 *
 * Deliberately excluded from this path: AI extraction and Comparable Listings.
 * Those run on the SLOW PATH (enrichment.server.ts) so a strong match reaches the
 * user in seconds instead of waiting on expensive secondary work.
 *
 * Baseline: the first successful check for a search records what is ALREADY
 * listed without alerting, so nobody gets hundreds of "new listing" notices for
 * inventory that predates them. Users who want those can set
 * `alert_existing_matches`.
 */
import { analyzeAndStoreListing, type SourceListing } from "./analyze.server";
import { collectableSources, getCollector, SourceRateLimitedError } from "./collectors.server";
import { canonicalListingUrl } from "./adapters/contract.shared";
import { EMPTY_CRITERIA } from "./catalog.shared";
import { buildMatchAlert, normalizeInterval } from "./monitor.shared";

type Client = { from: (t: string) => any };

const RATE_LIMIT_BACKOFF_SECONDS = 900;
const MAX_LISTINGS_PER_SOURCE = 120;

export type SourceRunSummary = {
  source: string;
  status: "ok" | "error" | "skipped";
  listingsSeen: number;
  newListings: number;
  qualified: number;
  alerted: number;
  baseline: boolean;
  rateLimited: boolean;
  error?: string | null;
};

export type SearchCheckResult = {
  searchId: string;
  name: string;
  runs: SourceRunSummary[];
  skipped?: string;
  baselineEstablished?: boolean;
};

/** Source identity for a listing: the marketplace's own id when it gave us one. */
function identity(listing: SourceListing): string {
  // Same rule the adapter contract uses: the source's own id when it has one,
  // otherwise the canonical (tracking-stripped) listing URL.
  return (listing.externalId?.trim() || canonicalListingUrl(listing.listingUrl || "")).trim();
}



async function logSourceRun(
  supabase: Client,
  workspaceId: string,
  searchId: string,
  summary: SourceRunSummary,
  startedAt: number,
): Promise<void> {
  try {
    await supabase.from("marketplace_source_runs").insert({
      workspace_id: workspaceId,
      search_id: searchId,
      source: summary.source,
      status: summary.status,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      listings_seen: summary.listingsSeen,
      new_listings: summary.newListings,
      qualified: summary.qualified,
      alerted: summary.alerted,
      baseline: summary.baseline,
      rate_limited: summary.rateLimited,
      error: summary.error ?? null,
    });
  } catch (err) {
    console.error("[marketplace] could not log source run:", err);
  }
}

/**
 * One scheduled check for one search: every collectable source, then the
 * schedule/health bookkeeping.
 */
export async function runSearchCheck(
  supabase: Client,
  search: any,
): Promise<SearchCheckResult> {
  const workspaceId = search.workspace_id as string;
  const interval = normalizeInterval(search.check_interval_seconds);
  const sources = collectableSources(search.sources ?? []);
  const runs: SourceRunSummary[] = [];

  if (!sources.length) {
    // Honest: nothing was collected. `last_success_at` is untouched, so the UI
    // keeps saying Source Unavailable instead of pretending to monitor.
    await supabase
      .from("marketplace_searches")
      .update({ next_check_at: new Date(Date.now() + interval * 1000).toISOString() })
      .eq("id", search.id);
    return { searchId: search.id, name: search.name, runs, skipped: "no_live_adapter" };
  }

  const baselineRun = (search.baseline_state ?? "pending") !== "established";
  const silentBaseline = baselineRun && !search.alert_existing_matches;
  let anySuccess = false;
  let rateLimitedSeconds = 0;
  let lastError: string | null = null;
  let baselineCount = 0;

  for (const source of sources) {
    const startedAt = Date.now();
    const summary: SourceRunSummary = {
      source,
      status: "ok",
      listingsSeen: 0,
      newListings: 0,
      qualified: 0,
      alerted: 0,
      baseline: baselineRun,
      rateLimited: false,
    };
    try {
      const collector = getCollector(source)!;
      const result = await collector.collect({
        id: search.id,
        category: search.category,
        criteria: { ...EMPTY_CRITERIA, ...(search.criteria ?? {}) },
        location: search.location ?? null,
        radiusMiles: search.radius_miles ?? null,
      });
      const listings = (result.listings ?? []).slice(0, MAX_LISTINGS_PER_SOURCE);
      summary.listingsSeen = listings.length;
      if (result.rateLimited) {
        summary.rateLimited = true;
        rateLimitedSeconds = Math.max(rateLimitedSeconds, RATE_LIMIT_BACKOFF_SECONDS);
      }

      const outcome = await processSourceListings(supabase, workspaceId, search, source, listings, {
        silentBaseline,
        baselineRun,
      });
      summary.newListings = outcome.newListings;
      summary.qualified = outcome.qualified;
      summary.alerted = outcome.alerted;
      baselineCount += outcome.baselineRecorded;
      anySuccess = true;
    } catch (err) {
      summary.status = "error";
      if (err instanceof SourceRateLimitedError) {
        summary.rateLimited = true;
        rateLimitedSeconds = Math.max(rateLimitedSeconds, err.retryAfterSeconds);
      }
      summary.error = err instanceof Error ? err.message : "Source check failed.";
      lastError = summary.error;
      console.error(`[marketplace] ${source} check failed for ${search.id}:`, summary.error);
    }
    runs.push(summary);
    await logSourceRun(supabase, workspaceId, search.id, summary, startedAt);
  }

  const now = new Date();
  const backoff = rateLimitedSeconds > 0 ? rateLimitedSeconds : interval;
  const patch: Record<string, unknown> = {
    last_checked_at: now.toISOString(),
    next_check_at: new Date(now.getTime() + backoff * 1000).toISOString(),
  };
  if (anySuccess) {
    patch.last_success_at = now.toISOString();
    patch.consecutive_failures = 0;
    patch.last_error = null;
    if (baselineRun) {
      patch.baseline_state = "established";
      patch.baseline_at = now.toISOString();
      patch.baseline_count = baselineCount;
    }
  } else {
    patch.consecutive_failures = Number(search.consecutive_failures ?? 0) + 1;
    patch.last_error = lastError;
    patch.last_error_at = now.toISOString();
  }
  if (rateLimitedSeconds > 0) {
    patch.rate_limited_until = new Date(now.getTime() + rateLimitedSeconds * 1000).toISOString();
  }
  const alerted = runs.reduce((n, r) => n + r.alerted, 0);
  if (alerted > 0) {
    patch.last_alerted_at = now.toISOString();
    patch.matches_found = Number(search.matches_found ?? 0) + alerted;
  }
  await supabase.from("marketplace_searches").update(patch).eq("id", search.id);

  return {
    searchId: search.id,
    name: search.name,
    runs,
    baselineEstablished: baselineRun && anySuccess,
  };
}

/**
 * Compare → identify new → analyze → store → alert, for one source's current
 * listing set. Previously seen listings are only touched to keep freshness true.
 */
async function processSourceListings(
  supabase: Client,
  workspaceId: string,
  search: any,
  source: string,
  listings: SourceListing[],
  opts: { silentBaseline: boolean; baselineRun: boolean },
): Promise<{ newListings: number; qualified: number; alerted: number; baselineRecorded: number }> {
  const ids = listings.map(identity).filter(Boolean);
  let seen: any[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("marketplace_listings")
      .select("id, external_id, posted_at, seen_count, last_alerted_at, price")
      .eq("workspace_id", workspaceId)
      .eq("search_id", search.id)
      .eq("source", source)
      .in("external_id", ids);
    seen = data ?? [];
  }
  const seenById = new Map(seen.map((r) => [String(r.external_id), r]));

  let newListings = 0;
  let qualified = 0;
  let alerted = 0;
  let baselineRecorded = 0;
  const nowIso = new Date().toISOString();

  for (const listing of listings) {
    const key = identity(listing);
    if (!key) continue;
    const existing = seenById.get(key);

    if (existing) {
      // Already known. Keep last_seen_at honest; note a relist/bump when the
      // source's own posting time moved forward. Position in search results is
      // never treated as evidence of newness.
      const patch: Record<string, unknown> = {
        last_seen_at: nowIso,
        seen_count: Number(existing.seen_count ?? 1) + 1,
        source_listing_id: listing.externalId ?? existing.external_id,
      };
      const prevPosted = existing.posted_at ? new Date(existing.posted_at).getTime() : 0;
      const nextPosted = listing.postedAt ? new Date(listing.postedAt).getTime() : 0;
      if (nextPosted && prevPosted && nextPosted > prevPosted) {
        patch.relisted_at = nowIso;
        patch.posted_at = listing.postedAt;
      }
      if (listing.price != null && Number(existing.price) !== Number(listing.price)) {
        patch.price = listing.price;
      }
      await supabase.from("marketplace_listings").update(patch).eq("id", existing.id);
      continue;
    }

    newListings += 1;
    // Fast path: no AI extraction, deterministic filters + scoring only.
    const stored = await analyzeAndStoreListing(
      supabase,
      workspaceId,
      listing,
      {
        id: search.id,
        category: search.category,
        criteria: { ...EMPTY_CRITERIA, ...(search.criteria ?? {}) },
        radiusMiles: search.radius_miles ?? null,
        minMatchScore: search.min_match_score ?? null,
      },
      { allowAi: false },
    );
    if (!stored.listingId || !stored.analysis) continue;

    const isBaseline = opts.baselineRun;
    if (isBaseline) baselineRecorded += 1;
    const shouldAlert = stored.analysis.alertEligible && !opts.silentBaseline;
    if (stored.analysis.alertEligible) qualified += 1;

    await supabase
      .from("marketplace_listings")
      .update({
        source_listing_id: listing.externalId ?? null,
        last_seen_at: nowIso,
        seen_count: 1,
        is_baseline: isBaseline,
        // Adapter-normalized extras. Only stored when the source actually
        // published them; the bridge nulls them out otherwise.
        latitude: listing.latitude ?? null,
        longitude: listing.longitude ?? null,
        seller_name: listing.sellerName ?? null,
        source_metadata: listing.sourceMetadata ?? {},

        // Slow path picks these up; the alert never waits for it.
        enrichment_state: "pending",
        // alerted_at is set by the analyzer for eligibility; suppress it for a
        // silent baseline so the feed does not claim we notified anyone.
        ...(shouldAlert ? {} : { alerted_at: null }),
      })
      .eq("id", stored.listingId);

    if (shouldAlert) {
      const sent = await sendMatchAlert(supabase, workspaceId, search, {
        listingId: stored.listingId,
        matchScore: stored.analysis.score,
        title: listing.title,
        price: listing.price ?? null,
        currency: listing.currency ?? "USD",
        attributes: stored.analysis.attributes,
        distanceMiles: listing.distanceMiles ?? null,
        locationText: listing.locationText ?? null,
        source,
      });
      if (sent) alerted += 1;
    }

    // Opt-in only: a search must be explicitly set to auto_above_score. A
    // baseline run never creates leads, and outreach is never started.
    if (
      !isBaseline &&
      search.lead_creation_mode === "auto_above_score" &&
      stored.analysis.alertEligible &&
      stored.analysis.score >= Number(search.auto_lead_min_score ?? 85)
    ) {
      try {
        await saveListingAsLead(supabase, stored.listingId, workspaceId, {
          origin: "auto_above_score",
        });
      } catch {
        // A lead-creation failure must not fail the discovery run; the match is
        // already in the feed and can still be saved by hand.
      }
    }
  }


  return { newListings, qualified, alerted, baselineRecorded };
}

/**
 * Alerting reuses LeadTrace's existing notification + activity architecture.
 * Never alerts twice for the same listing.
 */
export async function sendMatchAlert(
  supabase: Client,
  workspaceId: string,
  search: any,
  listing: {
    listingId: string;
    matchScore: number;
    title: string;
    price: number | null;
    currency?: string | null;
    attributes?: Record<string, string | number>;
    distanceMiles?: number | null;
    locationText?: string | null;
    source: string;
    compConfidence?: string | null;
    marketPositionLabel?: string | null;
  },
): Promise<boolean> {
  try {
    const { data: row } = await supabase
      .from("marketplace_listings")
      .select("last_alerted_at, alert_count")
      .eq("id", listing.listingId)
      .maybeSingle();
    if (row?.last_alerted_at) return false;

    const { title, body } = buildMatchAlert(listing);
    const nowIso = new Date().toISOString();

    if (search.notify_in_app !== false) {
      await supabase.from("notifications").insert({
        workspace_id: workspaceId,
        kind: "marketplace_match",
        title,
        body: `${body} — ${search.name}`,
      });
    }
    await supabase.from("activity_events").insert({
      workspace_id: workspaceId,
      type: "marketplace_match",
      summary: `${listing.matchScore}% Match — ${listing.title}`,
      detail: body,
      ref_id: listing.listingId,
      ref_type: "marketplace",
    });
    await supabase
      .from("marketplace_listings")
      .update({
        last_alerted_at: nowIso,
        alerted_at: nowIso,
        alert_count: Number(row?.alert_count ?? 0) + 1,
      })
      .eq("id", listing.listingId);
    return true;
  } catch (err) {
    console.error("[marketplace] alert failed:", err);
    return false;
  }
}

/** Scheduler entry point: every active search whose next check is due. */
export async function runDueChecks(limit = 25): Promise<{
  ok: boolean;
  due: number;
  checked: number;
  alerted: number;
  results: SearchCheckResult[];
  firstError?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("marketplace_searches")
    .select("*")
    .eq("status", "active")
    .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
    .order("next_check_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return { ok: false, due: 0, checked: 0, alerted: 0, results: [], firstError: error.message };

  const results: SearchCheckResult[] = [];
  let firstError: string | undefined;
  for (const search of data ?? []) {
    try {
      results.push(await runSearchCheck(supabaseAdmin as unknown as Client, search));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search check failed.";
      firstError ??= message;
      console.error(`[marketplace] check failed for ${(search as any).id}:`, message);
    }
  }
  const alerted = results.reduce(
    (n, r) => n + r.runs.reduce((m, run) => m + run.alerted, 0),
    0,
  );
  return {
    ok: !firstError,
    due: (data ?? []).length,
    checked: results.length,
    alerted,
    results,
    ...(firstError ? { firstError } : {}),
  };
}
