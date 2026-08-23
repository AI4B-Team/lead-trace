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
