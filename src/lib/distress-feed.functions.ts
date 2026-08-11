import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Public reads (no bearer token) power the marketing pages, so they must stay
 * callable during SSR and prerender. Authenticated reads power the in-app feed.
 */

export const getFeedLanding = createServerFn({ method: "GET" }).handler(async () => {
  const s = await import("./distress-feed.server");
  const [totals, states, top] = await Promise.all([s.feedTotals(), s.stateSummaries(), s.topCounties(20)]);
  // Sample table: most recent filings from the highest-volume covered county.
  const lead = top[0];
  const sample = lead ? await s.countyPreview(lead.state, lead.county, 8) : [];
  return { totals, states, top, sample, sampleCounty: lead ?? null };
});

export const getFeedStates = createServerFn({ method: "GET" }).handler(async () => {
  const { stateSummaries } = await import("./distress-feed.server");
  return { states: await stateSummaries() };
});

export const getFeedCounties = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ state: z.string().min(2).max(2) }).parse(input))
  .handler(async ({ data }) => {
    const { countySummaries } = await import("./distress-feed.server");
    return { counties: await countySummaries(data.state) };
  });

export const getCountyPage = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ state: z.string().min(2).max(2), county: z.string().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data }) => {
    const s = await import("./distress-feed.server");
    const [counties, preview, guides, surplus] = await Promise.all([
      s.countySummaries(data.state),
      s.countyPreview(data.state, data.county, 10),
      s.listGuides(data.state),
      s.surplusPreview(data.state, data.county, 6).catch(() => []),
    ]);
    const match = counties.find((c) => c.county.toLowerCase() === data.county.toLowerCase()) ?? null;
    return {
      county: match,
      countyName: match?.county ?? data.county,
      state: data.state.toUpperCase(),
      preview,
      surplus,
      siblings: counties.filter((c) => c.county.toLowerCase() !== data.county.toLowerCase()).slice(0, 12),
      guides: guides.filter((g) => g.county.toLowerCase() === data.county.toLowerCase()),
      configuredTypes: s.configuredTypes(data.state, match?.county ?? data.county),
    };
  });

export const getGuideIndex = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ state: z.string().min(2).max(2).optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { listGuides } = await import("./distress-feed.server");
    return { guides: await listGuides(data.state) };
  });

export const getGuideDetail = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        state: z.string().min(2).max(2),
        county: z.string().min(1).max(60),
        recordType: z.string().min(2).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getGuide } = await import("./distress-feed.server");
    return { guide: await getGuide(data.state, data.county, data.recordType) };
  });

// ---------------------------------------------------------------------------
// In-app feed
// ---------------------------------------------------------------------------

const filterSchema = z.object({
  state: z.string().max(2).optional(),
  county: z.string().max(60).optional(),
  recordTypes: z.array(z.string().max(40)).max(10).default([]),
  /** Default view. "new" uses the per-user watermark for the selected county. */
  view: z.enum(["new", "all"]).default("new"),
  filedAfter: z.string().max(10).nullable().default(null),
  pulledAfter: z.string().max(10).nullable().default(null),
  search: z.string().max(120).nullable().default(null),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).max(10_000).default(0),
});

export const queryFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => filterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { countyKey } = await import("./distress-feed.shared");

    let watermark: string | null = null;
    if (data.county && data.state) {
      const { data: view } = await context.supabase
        .from("distress_feed_views")
        .select("last_viewed_at")
        .eq("user_id", context.userId)
        .eq("fips", countyKey(data.state, data.county))
        .maybeSingle();
      watermark = (view as { last_viewed_at: string } | null)?.last_viewed_at ?? null;
    }

    // The feed holds nationwide public-records PII, so it is not exposed on the
    // Data API at all. Reads happen server-side after the auth middleware has
    // verified the caller.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("distress_records")
      .select(
        "id, state, county, record_type, doc_number, filed_date, pulled_date, owner_first, owner_last, company_entity, property_address, property_city, property_state, property_zip, amount, auction_date, status, parcel_apn, source_url, created_at",
        { count: "exact" },
      )
      .order("filed_date", { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.state) q = q.eq("state", data.state.toUpperCase());
    if (data.county) q = q.ilike("county", data.county);
    if (data.recordTypes.length) q = q.in("record_type", data.recordTypes);
    if (data.filedAfter) q = q.gte("filed_date", data.filedAfter);
    if (data.pulledAfter) q = q.gte("pulled_date", data.pulledAfter);
    if (data.view === "new" && watermark) q = q.gt("created_at", watermark);
    if (data.search) {
      const term = `%${data.search.replace(/[%,]/g, "")}%`;
      q = q.or(
        `owner_last.ilike.${term},owner_first.ilike.${term},company_entity.ilike.${term},property_address.ilike.${term},doc_number.ilike.${term}`,
      );
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, watermark };
  });

/** Moves the per-user "new since" line for a county after they have looked. */
export const markCountyViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ state: z.string().min(2).max(2), county: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { countyKey } = await import("./distress-feed.shared");
    const { error } = await context.supabase.from("distress_feed_views").upsert(
      {
        user_id: context.userId,
        fips: countyKey(data.state, data.county),
        last_viewed_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id,fips" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Pull selected filings into the workspace's own leads. This is the ONLY point
 * in the Distress Feed where credits move: browsing and filtering the feed is
 * free because the pull that produced it was paid for once, for everyone.
 */
export const addFeedRecordsToLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        recordIds: z.array(z.string().uuid()).min(1).max(2000),
        listName: z.string().max(80).nullable().default(null),
        skipTrace: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .insert({
        workspace_id: data.workspaceId,
        source_type: "distress_feed",
        record_type: "distress_feed",
        status: "queued",
        name: data.listName ?? `Distress Feed — ${data.recordIds.length} records`,
        created_by: context.userId,
        channel: "sms",
        params: {
          distress_record_ids: data.recordIds,
          skip_trace: data.skipTrace,
          max_results: data.recordIds.length,
        } as never,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const jobId = (job as { id: string }).id;
    const { executePipeline } = await import("./pipeline.server");
    const result = await executePipeline(context.supabase, jobId);
    return { jobId, result };
  });
