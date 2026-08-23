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
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  status: z.enum(["active", "paused"]).optional(),
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
