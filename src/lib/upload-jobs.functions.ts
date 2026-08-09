// Uploads are the one source that queues from the browser. It routes through a
// server function so `job-submit` stays server-only and can enforce the
// coverage gate without leaking server modules into the client bundle.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const queueUploadJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        channel: z.enum(["sms", "email", "direct_mail"]).nullable().default(null),
        params: z.record(z.string(), z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Viewers can't queue work; members and admins can.
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "build_list");
    const { queueJob } = await import("./job-submit");
    return queueJob(context.supabase, {
      workspaceId: data.workspaceId,
      createdBy: context.userId,
      sourceType: "upload",
      channel: data.channel,
      params: data.params,
    });
  });
