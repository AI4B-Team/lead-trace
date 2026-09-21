import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jobParamsFromSpec, jobSpecSchema, specStates } from "@/lib/assistant.shared";
import { screenSourceRequest, TIER_STATUS } from "@/lib/source-request.shared";

const MESSAGE_CONTENT_CAP = 4000;

// Truncate long messages instead of rejecting: the transcript is an audit
// trail, and a verbose assistant reply must never block job creation
// ("Generate List" failed with `too_big` on transcript content, 2026-09-21).
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .transform((s) => (s.length > MESSAGE_CONTENT_CAP ? `${s.slice(0, MESSAGE_CONTENT_CAP - 1)}…` : s)),
});

/** One assistant turn: natural-language reply plus a validated Job Spec. */
export const assistantChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        message: z.string().min(1).max(2000),
        history: z.array(messageSchema).max(24).default([]),
        spec: jobSpecSchema,
        /** Fields the operator hand-edited in the panel since the last turn. */
        panelEdits: z.array(z.string().max(60)).max(20).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAssistant, estimate, precheckCompliance } = await import("@/lib/assistant.server");
    const { loadReferenceData } = await import("@/lib/reference-data.server");
    const { coverageForCounty, coverageLabel } = await import("@/lib/reference-data.shared");
    const { TEMPLATES } = await import("@/lib/templates");
    const { templateAdapterStatus } = await import("@/lib/template-schema");

    const refusal = precheckCompliance(data.message);
    if (refusal) {
      return {
        reply: `I Can't Set That Up. ${refusal}`,
        spec: data.spec,
        coverage: [],
        suggestedTemplates: [],
        estimate: estimate(data.spec),
        refused: true,
      };
    }

    const ref = await loadReferenceData(context.supabase);
    // The single source of truth for what can run is source_coverage where
    // status='verified' — the same rows the coverage gate reads. The assistant
    // may only speak about, and suggest, these county/record-type pairs.
    const { verifiedCoverage } = await import("@/lib/distress/coverage.server");
    const verified = await verifiedCoverage();
    const coveredPairs = [
      ...new Set(
        verified.map((r) => `${r.county_name ?? r.fips}, ${r.state} — ${r.record_type}`),
      ),
    ].sort();
    const result = await askAssistant({
      history: data.history,
      message: data.message,
      spec: data.spec,
      coveredPairs,
      niches: ref.niches.map((n) => n.name),
      recordTypes: ref.recordTypes.map((r) => r.name),
      templateCatalog: TEMPLATES.map((t) => `${t.id} — ${t.title} — ${templateAdapterStatus(t)}`).join("\n"),
      panelEdits: data.panelEdits,
    });

    // Coverage is decided by real adapter data, never by the model. Only
    // public-records adapters are county-scoped; business scrapes are nationwide.
    const coverage = result.spec.counties.map((county) => ({
      county,
      coverage: coverageForCounty(ref.countyCoverage, county, result.spec.sourceType),
    }));

    return {
      reply: result.reply,
      spec: result.spec,
      coverage,
      suggestedTemplates: result.suggestedTemplates,
      estimate: estimate(result.spec),
      specComplete: Boolean(result.specComplete),
    };
  });

/**
 * Log a source the platform can't run yet so it lands in the build backlog.
 * The intake carries build-scoping detail (URL, fields, geo, cadence) and every
 * submission is screened server-side: non-compliant asks are recorded as
 * `screened_out` and never queued as buildable.
 */
export const requestCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        county: z.string().max(80).nullable().default(null),
        recordType: z.string().max(80).nullable().default(null),
        templateId: z.string().max(60).nullable().default(null),
        type: z.enum(["county", "record_type", "template_adapter"]).default("county"),
        sourceLabel: z.string().max(160).nullable().default(null),
        targetUrl: z.string().max(600).nullable().default(null),
        desiredFields: z.array(z.string().max(60)).max(20).default([]),
        geo: z.string().max(200).nullable().default(null),
        frequency: z.enum(["one_time", "daily", "weekly", "monthly"]).default("one_time"),
        notes: z.string().max(2000).nullable().default(null),
        loginRequired: z
          .enum(["none", "free_public_records", "restricted_platform", "unsure"])
          .default("none"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const label = data.sourceLabel?.trim() || data.recordType || data.county || null;
    // Authoritative screen — the client's copy of this is only a fast preview.
    const screen = screenSourceRequest({
      sourceLabel: label ?? "",
      targetUrl: data.targetUrl,
      desiredFields: data.desiredFields,
      geo: data.geo,
      frequency: data.frequency,
      notes: data.notes,
      loginRequired: data.loginRequired,
    });

    // Beta waitlist clicks are idempotent — one row per workspace + template.
    if (data.type === "template_adapter" && data.templateId) {
      const { data: existing } = await context.supabase
        .from("adapter_requests")
        .select("id")
        .eq("workspace_id", data.workspaceId)
        .eq("type", "template_adapter")
        .eq("template_id", data.templateId)
        .limit(1);
      if (existing && existing.length > 0) {
        return {
          ok: true,
          email: context.claims?.email ?? null,
          alreadyRequested: true,
          screened: false,
          reason: null as string | null,
          tier: "standard" as const,
          outreach: screen.outreach,
        };
      }
    }
    const { error } = await context.supabase.from("adapter_requests").insert({
      workspace_id: data.workspaceId,
      county: data.county,
      record_type: data.recordType,
      template_id: data.templateId,
      type: data.type,
      source_label: label,
      target_url: data.targetUrl,
      desired_fields: data.desiredFields,
      geo: data.geo,
      frequency: data.frequency,
      notes: data.notes,
      requested_by: context.userId,
      login_required: data.loginRequired,
      risk_tier: screen.tier,
      status: TIER_STATUS[screen.tier],
      screening_reason: screen.reason,
      outreach_level: screen.outreach.level,
      outreach_note: screen.outreach.text,
    });
    if (error) throw new Error(error.message);
    {
      const { logActivity } = await import("./activity.server");
      await logActivity(context.supabase, data.workspaceId, {
        type: "adapter_requested",
        summary:
          screen.tier === "standard"
            ? `Source Requested — ${label ?? data.templateId ?? "New Source"}`
            : screen.tier === "review"
              ? `Source Request Flagged For Review — ${label ?? "New Source"}`
              : `Source Request Not Buildable — ${label ?? "New Source"}`,
        detail: screen.reason ?? data.county ?? data.recordType ?? data.targetUrl ?? null,
        refType: "template",
        actorId: context.userId,
      });
    }
    return {
      ok: screen.ok,
      email: context.claims?.email ?? null,
      alreadyRequested: false,
      screened: screen.tier === "rejected",
      reason: screen.reason,
      tier: screen.tier,
      outreach: screen.outreach,
    };
  });

/** Which beta sources this workspace already joined the waitlist for. */
export const listAdapterRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("adapter_requests")
      .select("template_id, status")
      .eq("workspace_id", data.workspaceId)
      .eq("type", "template_adapter");
    if (error) throw new Error(error.message);
    return {
      templateIds: (rows ?? [])
        .filter((r) => r.status !== "screened_out")
        .map((r) => r.template_id)
        .filter((id): id is string => Boolean(id)),
      email: context.claims?.email ?? null,
    };
  });

/**
 * Turn the assembled spec into a real queued job. The conversation is stored on
 * the job for audit: who assembled what, and how.
 */
export const createJobFromSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        spec: jobSpecSchema,
        transcript: z.array(messageSchema).max(60).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const spec = data.spec;
    if (!spec.sourceType) throw new Error("Pick A Source First");
    if (spec.sourceType === "upload") throw new Error("Uploaded Lists Start On The Upload Page");
    if (spec.sourceType === "business" && !spec.niches.length) throw new Error("Add At Least One Niche");
    if (spec.sourceType === "records" && !spec.recordType) throw new Error("Pick A Record Type");

    // Coverage is settled BEFORE spend is checked or priced: a run with no
    // verified county never reaches the cap check, the estimate, or the queue.
    // Same function `queueJob` enforces, so the two can never disagree.
    const { assertJobCoverage } = await import("./distress/coverage.server");
    const coverage = await assertJobCoverage({
      sourceType: spec.sourceType,
      recordType: spec.recordType,
      counties: spec.counties,
      states: specStates(spec),
      workspaceId: data.workspaceId,
      requestedBy: context.userId,
    });
    // Partial coverage is priced on the verified counties only.
    const runCounties = coverage.gated ? coverage.coveredCounties : spec.counties;

    // Role + cap enforcement lives server-side: a client that skips the
    // pre-flight check still cannot spend past its cap.
    {
      const { assertSpendAllowed } = await import("./accountability.server");
      // Real projected volume: the cap applies per search, and one search runs
      // per niche × county. This is what the credit cap must be checked against.
      const perSearch = Math.max(0, Number(spec.maxResults ?? 0));
      const searches =
        Math.max(1, runCounties.length || 1) *
        (spec.sourceType === "business" ? Math.max(1, spec.niches.length) : 1);
      const estimated = perSearch * searches;
      await assertSpendAllowed(context.supabase, data.workspaceId, context.userId, {
        amount: estimated,
        action: "build_list",
        summary: `Build List · ${spec.name ?? spec.templateId ?? spec.sourceType}`,
      });
    }
    const geoLabel = runCounties.join(", ") || specStates(spec).join(", ") || "All";
    const name =
      spec.name ??
      (spec.sourceType === "records"
        ? `${spec.recordType} · ${geoLabel}`
        : spec.sourceType === "street_scan"
          ? `Street Scan · ${geoLabel}`
          : `${spec.niches.join(", ")} · ${geoLabel}`);

    const { queueJob } = await import("@/lib/job-submit");
    const { inferChannel } = await import("@/lib/channels");
    const channel =
      spec.channel ??
      inferChannel({
        templateId: spec.templateId,
        sourceType: spec.sourceType,
        recordType: spec.recordType,
        country: spec.country,
      });
    const queued = await queueJob(context.supabase, {
      workspaceId: data.workspaceId,
      createdBy: context.userId,
      sourceType: spec.sourceType,
      channel,
      // The coverage gate inside queueJob reads `recordType` — omitting it made
      // a fully specified records run fail as "no record type".
      recordType: spec.recordType,
      params: jobParamsFromSpec(spec, {
        name,
        counties: runCounties,
        transcript: data.transcript,
      }),
    });
    return { jobId: queued.id, duplicate: queued.duplicate };
  });