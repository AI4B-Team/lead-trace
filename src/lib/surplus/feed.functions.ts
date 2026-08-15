import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { surplusFiltersSchema } from "./feed.schema";

export const listSurplusRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => surplusFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const s = await import("./feed.server");
    await s.assertMember(context.supabase, context.userId, data.workspaceId);
    return s.listRecords(data);
  });

export const listSurplusStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid().nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./feed.server");
    await s.assertMember(context.supabase, context.userId, data.workspaceId);
    return { states: await s.listStates(data.workspaceId) };
  });

export const listSurplusCounties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        states: z.array(z.string().length(2)).default([]),
        workspaceId: z.string().uuid().nullable().default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./feed.server");
    await s.assertMember(context.supabase, context.userId, data.workspaceId);
    return { counties: await s.listCounties(data.states, data.workspaceId) };
  });

export const exportSurplusRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => surplusFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const s = await import("./feed.server");
    await s.assertMember(context.supabase, context.userId, data.workspaceId);
    return s.exportRecords(data);
  });