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
  .handler(async () => {
    const s = await import("./feed.server");
    return { states: await s.listStates(null) };
  });

export const listSurplusCounties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ states: z.array(z.string().length(2)).default([]) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const s = await import("./feed.server");
    return { counties: await s.listCounties(data.states) };
  });

export const exportSurplusRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => surplusFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const s = await import("./feed.server");
    await s.assertMember(context.supabase, context.userId, data.workspaceId);
    return s.exportRecords(data);
  });