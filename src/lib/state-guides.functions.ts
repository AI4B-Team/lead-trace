import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Public state-page reads stay unauthenticated so SSR and prerender work.
 * Admin CRUD is super-admin only.
 */

const stateSchema = z.object({ state: z.string().length(2) });
const typeSchema = stateSchema.extend({ recordTypeSlug: z.string().min(2).max(40) });

export const getStatesIndex = createServerFn({ method: "GET" }).handler(async () => {
  const feed = await import("./distress-feed.server");
  const sg = await import("./state-guides.server");
  const [states, guides] = await Promise.all([
    feed.stateSummaries(),
    sg.listPublishedStateGuides(),
  ]);
  return { states, guides };
});

export const getStateHub = createServerFn({ method: "GET" })
  .inputValidator((input) => stateSchema.parse(input))
  .handler(async ({ data }) => {
    const feed = await import("./distress-feed.server");
    const sg = await import("./state-guides.server");
    const { recordTypeIdForSlug } = await import("./state-guides.shared");
    const state = data.state.toUpperCase();
    const [counties, guides] = await Promise.all([
      feed.countySummaries(state),
      sg.listPublishedStateGuides({ state }),
    ]);
    const stats = await Promise.all(
      guides.map(async (g) => {
        const id = recordTypeIdForSlug(g.record_type_slug);
        return {
          slug: g.record_type_slug,
          stats: id ? await sg.stateTypeStats(state, id) : null,
        };
      }),
    );
    return { state, counties, guides, stats };
  });

export const getStateTypePage = createServerFn({ method: "GET" })
  .inputValidator((input) => typeSchema.parse(input))
  .handler(async ({ data }) => {
    const feed = await import("./distress-feed.server");
    const sg = await import("./state-guides.server");
    const { recordTypeIdForSlug } = await import("./state-guides.shared");
    const state = data.state.toUpperCase();
    const recordTypeId = recordTypeIdForSlug(data.recordTypeSlug);
    const guide = await sg.getPublishedStateGuide(state, data.recordTypeSlug);
    // Unpublished or missing: the route renders a noindex "coming soon" page,
    // so there is no reason to pay for the live aggregates.
    if (!guide || !recordTypeId) {
      return { state, guide: null, counties: [], stats: null, countyGuides: [], otherStates: [] };
    }
    const [counties, stats, countyGuides, otherStates] = await Promise.all([
      sg.stateTypeCounties(state, recordTypeId),
      sg.stateTypeStats(state, recordTypeId),
      feed.listGuides(state),
      sg.listPublishedStateGuides({ recordTypeSlug: data.recordTypeSlug }),
    ]);
    return {
      state,
      guide,
      counties,
      stats,
      countyGuides: countyGuides.filter((g) => g.record_type === recordTypeId),
      otherStates: otherStates
        .filter((g) => g.state.toUpperCase() !== state)
        .map((g) => ({ state: g.state.toUpperCase(), slug: g.record_type_slug })),
    };
  });

// ── Admin CRUD ─────────────────────────────────────────────────────────────

export const listStateGuidesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isSuperAdmin } = await import("./access-checks");
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { listAllStateGuides } = await import("./state-guides.server");
    return { guides: await listAllStateGuides() };
  });

const saveSchema = z.object({
  state: z.string().length(2),
  recordTypeSlug: z.string().min(2).max(40),
  published: z.boolean(),
  title: z.string().max(160).nullable(),
  intro: z.string().max(4000).nullable(),
  law_sale_type: z.string().max(1000).nullable(),
  law_records_holder: z.string().max(1000).nullable(),
  law_claim_window: z.string().max(1000).nullable(),
  law_local_terminology: z.string().max(1000).nullable(),
  law_public_records_statute: z.string().max(1000).nullable(),
  law_notes: z.string().max(4000).nullable(),
  steps: z
    .array(z.object({ heading: z.string().max(160).optional(), body: z.string().max(2000) }))
    .max(20),
  faqs: z.array(z.object({ question: z.string().max(300), answer: z.string().max(2000) })).max(20),
  what_is_body: z.string().max(6000).nullable(),
  how_pros_use_body: z.string().max(6000).nullable(),
});

export const saveStateGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await import("./access-checks");
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { state, recordTypeSlug, ...rest } = data;
    const { error } = await supabaseAdmin.from("state_guides").upsert(
      {
        state: state.toUpperCase(),
        record_type_slug: recordTypeSlug,
        ...rest,
      } as never,
      { onConflict: "state,record_type_slug" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Published record-type slugs for a state — used for upward links from county pages. */
export const getPublishedStateTypes = createServerFn({ method: "GET" })
  .inputValidator((input) => stateSchema.parse(input))
  .handler(async ({ data }) => {
    const { listPublishedStateGuides } = await import("./state-guides.server");
    const guides = await listPublishedStateGuides({ state: data.state.toUpperCase() });
    return { slugs: guides.map((g) => g.record_type_slug) };
  });
