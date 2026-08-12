import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public surplus guide reads. Unauthenticated on purpose: these back
 * shareable marketing pages that must render during SSR and prerender.
 * Everything returned here is already gated to published, clerk-confirmed
 * public-records data by the database view.
 */

const stateSchema = z.object({ state: z.string().length(2) });
const countySchema = stateSchema.extend({ county: z.string().min(2).max(80) });

export const getSurplusStatePage = createServerFn({ method: "GET" })
  .inputValidator((input) => stateSchema.parse(input))
  .handler(async ({ data }) => {
    const s = await import("./public.server");
    const state = data.state.toUpperCase();
    const rules = await s.getStateRules(state);
    // Unpublished state: the route renders a noindex "coming soon" page, so
    // there is no reason to pay for the live aggregates.
    if (!rules) return { state, rules: null, aggregate: null, counties: [], faqs: [] };
    const [aggregate, counties, faqs] = await Promise.all([
      s.stateAggregate(state),
      s.stateCounties(state),
      s.listFaqs(state, null),
    ]);
    return { state, rules, aggregate, counties, faqs };
  });

export const getSurplusCountyPage = createServerFn({ method: "GET" })
  .inputValidator((input) => countySchema.parse(input))
  .handler(async ({ data }) => {
    const s = await import("./public.server");
    const state = data.state.toUpperCase();
    const [rules, county] = await Promise.all([
      s.getStateRules(state),
      s.getCountyPage(state, data.county),
    ]);
    if (!rules || !county) {
      return { state, rules: null, county: null, aggregate: null, nearby: [], faqs: [] };
    }
    const [aggregate, nearby, faqs] = await Promise.all([
      s.countyAggregate(county.fips),
      s.nearbyCounties(county.fips),
      s.listFaqs(state, county.fips),
    ]);
    return { state, rules, county, aggregate, nearby, faqs };
  });