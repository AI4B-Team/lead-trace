import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const criteriaSchema = z.object({
  targets: z.array(z.string()).default([]),
  priceMin: z.number().nullable().default(null),
  priceMax: z.number().nullable().default(null),
  keywords: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
  attributes: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

export const parseMarketplaceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(2000),
        category: z.string().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const s = await import("./parse.server");
    return s.parseRequest(data.prompt, (data.category as any) ?? null);
  });

export const createMarketplaceSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        category: z.string().min(1),
        prompt: z.string().max(2000).default(""),
        criteria: criteriaSchema,
        sources: z.array(z.string()).default([]),
        location: z.string().max(200).nullable().default(null),
        radiusMiles: z.number().int().nullable().default(null),
        minMatchScore: z.number().int().min(0).max(100).optional(),
        checkIntervalSeconds: z.number().int().min(60).max(86400).optional(),
        alertExistingMatches: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./searches.server");
    return s.insertSearch(context.supabase, context.userId, data);
  });

export const listMarketplaceSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./searches.server");
    return { searches: await s.listSearches(context.supabase, data.workspaceId) };
  });

const patchSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).optional(),
  prompt: z.string().max(2000).optional(),
  criteria: criteriaSchema.optional(),
  sources: z.array(z.string()).optional(),
  location: z.string().max(200).nullable().optional(),
  radiusMiles: z.number().int().nullable().optional(),
  alertThreshold: z.number().int().min(1).max(100).optional(),
  minMatchScore: z.number().int().min(0).max(100).optional(),
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  status: z.enum(["active", "paused"]).optional(),
  checkIntervalSeconds: z.number().int().min(60).max(86400).optional(),
  alertExistingMatches: z.boolean().optional(),
});

export const updateMarketplaceSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => patchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, workspaceId, ...patch } = data;
    const s = await import("./searches.server");
    return s.updateSearch(context.supabase, id, workspaceId, patch);
  });

export const duplicateMarketplaceSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./searches.server");
    return s.duplicateSearch(context.supabase, context.userId, data.id, data.workspaceId);
  });

export const deleteMarketplaceSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./searches.server");
    return s.deleteSearch(context.supabase, data.id, data.workspaceId);
  });

export const listMarketplaceDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        searchId: z.string().uuid().nullable().default(null),
        category: z.string().nullable().default(null),
        source: z.string().nullable().default(null),
        minScore: z.number().int().min(0).max(100).default(0),
        location: z.string().max(120).nullable().default(null),
        freshnessHours: z.number().int().min(0).max(8760).default(0),
        query: z.string().max(200).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./listings.server");
    return { listings: await s.listDeals(context.supabase, data) };
  });

export const dismissMarketplaceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        workspaceId: z.string().uuid(),
        dismissed: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./listings.server");
    return s.setDismissed(context.supabase, data.id, data.workspaceId, data.dismissed);
  });

export const saveMarketplaceListingAsLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./listings.server");
    return s.saveListingAsLead(context.supabase, data.id, data.workspaceId);
  });

/**
 * Re-run the matching layer for one stored listing. Used after a search's
 * criteria change so the Match Score and explanation stay in step with them.
 */
export const reanalyzeMarketplaceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./analyze.server");
    return s.reanalyzeStoredListing(context.supabase, data.workspaceId, data.id);
  });

/**
 * Comparable Listings for one stored listing. Reuses a cached comp run unless
 * `refresh` is set, since comp gathering is expensive.
 */
export const getMarketplaceComps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        workspaceId: z.string().uuid(),
        refresh: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./comps.server");
    return s.checkComps(context.supabase, data.workspaceId, data.id, { refresh: data.refresh });
  });

/**
 * Manual "Check Now". Runs the same fast path the scheduler runs — collect,
 * dedupe against previously seen listings, filter, score, alert. Membership is
 * verified through the caller's RLS-scoped client before the engine runs with
 * elevated rights.
 */
export const runMarketplaceCheckNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("marketplace_searches")
      .select("id")
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error || !row) throw new Error("That marketplace search no longer exists.");

    const { collectableSources } = await import("./collectors.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: full } = await supabaseAdmin
      .from("marketplace_searches")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!full) throw new Error("That marketplace search no longer exists.");
    if (!collectableSources((full as any).sources ?? []).length) {
      // Never pretend a check ran against a source we cannot reach.
      return {
        ran: false,
        reason: "No marketplace connection is live yet, so there is nothing to check.",
        runs: [],
      };
    }
    const { runSearchCheck } = await import("./monitor.server");
    const result = await runSearchCheck(supabaseAdmin as never, full);
    return { ran: true, reason: null, runs: result.runs };
  });

/** Recent per-source check history for one search — the health evidence trail. */
export const listMarketplaceSourceRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        searchId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(15),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("marketplace_source_runs")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("search_id", data.searchId)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });
