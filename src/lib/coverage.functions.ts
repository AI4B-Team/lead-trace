import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public: everything we actually pull, so selectors can mark the rest honestly. */
export const getVerifiedCoverage = createServerFn({ method: "GET" }).handler(async () => {
  const { verifiedCoverage } = await import("./distress/coverage.server");
  return { coverage: await verifiedCoverage() };
});

/** Public: how many workspaces have asked for this county/record type. */
export const getCoverageDemand = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ county: z.string().min(1).max(120), recordType: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { coverageDemand } = await import("./distress/coverage.server");
    return { requests: await coverageDemand(data.county, data.recordType) };
  });

/** Log demand for an uncovered county. */
export const requestCountyCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        county: z.string().min(1).max(120),
        recordType: z.string().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    const { logCoverageRequests, coverageDemand } = await import("./distress/coverage.server");
    await logCoverageRequests([{ county: data.county, recordType: data.recordType }], {
      workspaceId: data.workspaceId,
      requestedBy: context.userId,
    });
    return { ok: true, requests: await coverageDemand(data.county, data.recordType) };
  });

/** Admin coverage matrix: states down, record types across. */
export const getCoverageMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isSuperAdmin } = await import("./access-checks");
    const isAdmin = await isSuperAdmin(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Forbidden");
    const { coverageMatrix } = await import("./distress/coverage.server");
    return await coverageMatrix();
  });
/**
 * Coverage verdict the client needs BEFORE pricing: is this county/record type
 * runnable at all? Backed by the same function as the server-side gate, so the
 * UI can never show a price the runner would refuse.
 */
export const getJobCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sourceType: z.string().nullable(),
        recordType: z.string().nullable().default(null),
        counties: z.array(z.string()).max(300).default([]),
        states: z.array(z.string()).max(60).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { jobCoverage } = await import("./distress/coverage.server");
    return jobCoverage(data);
  });

/** Record types with at least one verified adapter — drives the picker. */
export const getCoveredRecordTypes = createServerFn({ method: "GET" }).handler(async () => {
  const { coveredRecordTypes } = await import("./distress/coverage.server");
  return { recordTypes: await coveredRecordTypes() };
});
