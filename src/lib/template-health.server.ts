/**
 * Daily canary runner for the Template Health Agent.
 *
 * One canary per *adapter*, not per template — several templates ride the same
 * Apify actor or the same open-data path, and we are not going to pay for a
 * dozen identical runs every morning. Each canary result is fanned out to the
 * templates that depend on it.
 *
 * Runs are capped at CANARY_ROW_CAP rows against a fixed, known-good input so a
 * change in the source (not in our request) is what moves the needle.
 */

import {
  assess,
  computeFillRates,
  CANARY_ROW_CAP,
  licensedRecordTemplateIds,
  openDataRecordTemplateIds,
  type CanaryRow,
  type FillRates,
  type HealthStatus,
} from "@/lib/template-health.shared";
import { TEMPLATES, hasCategory, type Template } from "@/lib/templates";

type Canary = {
  key: string;
  label: string;
  /** Templates this canary speaks for. */
  templateIds: string[];
  /**
   * Rows, or a skip when the source is in a known licensing state. A skip is
   * NOT a failure: it must never write a "broken" verdict.
   */
  run: () => Promise<CanaryRow[] | { skipped: string }>;
};

/** Fixed known-good inputs. Do not "improve" these — stability is the point. */
const GMAPS_PROBE = { niches: ["HVAC"], counties: ["Hillsborough"], state: "FL" };
const RECORDS_PROBE = { county: "Hillsborough, FL", recordType: "code_violations" };
/** RealeFlow /search probe: one enabled type, one covered county. */
const REALEFLOW_PROBE = { county: "Hillsborough", recordType: "probate" };

/** Templates that route through the business (Apify) adapter. */
function businessTemplateIds(): string[] {
  const categories = new Set(["business", "directories", "search", "reviews"]);
  return TEMPLATES.filter((t: Template) => t.categories.some((c) => categories.has(c))).map((t) => t.id);
}

/**
 * Only the records templates the open-data probe actually exercises. Fanning an
 * open-data outage out to every records template greyed out the licensed
 * RealeFlow types (probate / tax defaults / vacancy) that the probe never
 * touches — the bug this narrowing removes.
 */
function recordsOpenDataTemplateIds(): string[] {
  const known = new Set(TEMPLATES.filter((t: Template) => hasCategory(t, "records")).map((t) => t.id));
  return openDataRecordTemplateIds().filter((id) => known.has(id));
}

/** Templates served by the licensed API, limited to entitled record types. */
function recordsLicensedTemplateIds(): string[] {
  const known = new Set(TEMPLATES.filter((t: Template) => hasCategory(t, "records")).map((t) => t.id));
  return licensedRecordTemplateIds({ enabledOnly: true }).filter((id) => known.has(id));
}

function canaries(): Canary[] {
  return [
    {
      key: "apify.gmaps",
      label: "Google Maps (Apify)",
      templateIds: businessTemplateIds(),
      async run() {
        const { getBusinessScraper } = await import("@/lib/data-providers/apify");
        const scraper = getBusinessScraper();
        if (!scraper.isConfigured()) throw new Error("Apify is not configured — canary could not run.");
        const rows = await scraper.scrape({ ...GMAPS_PROBE, max_results: CANARY_ROW_CAP });
        return rows.slice(0, CANARY_ROW_CAP) as CanaryRow[];
      },
    },
    {
      key: "records.open_data",
      label: "County Open Data",
      templateIds: recordsOpenDataTemplateIds(),
      async run() {
        const { fetchCatalogedRecords } = await import("@/lib/data-providers/source-registry.server");
        const rows = await fetchCatalogedRecords({ ...RECORDS_PROBE, limit: CANARY_ROW_CAP });
        if (rows === null) throw new Error("No catalogued open-data source for the probe county.");
        return rows.slice(0, CANARY_ROW_CAP) as CanaryRow[];
      },
    },
    {
      key: "records.realeflow",
      label: "Licensed Property Records API",
      templateIds: recordsLicensedTemplateIds(),
      async run() {
        const { FL_COUNTY_FIPS } = await import("@/lib/fl-counties");
        const {
          REALEFLOW_LEAD_CONFIGS,
          buildSearchBody,
          isEntitlementError,
          streetAddress,
        } = await import("@/lib/data-providers/realeflow-source.shared");
        const { rfSearch, RealeflowError } = await import("@/lib/realeflow/client.server");

        const config = REALEFLOW_LEAD_CONFIGS.find(
          (c) => c.recordType === REALEFLOW_PROBE.recordType,
        );
        if (!config) throw new Error("No RealeFlow config for the probe record type.");
        if (!config.enabled) {
          return { skipped: config.disabledReason ?? "awaiting RealeFlow entitlement" };
        }
        const fips = FL_COUNTY_FIPS[REALEFLOW_PROBE.county];
        if (!fips) throw new Error("Unknown probe county for the licensed records canary.");

        try {
          const res = await rfSearch(
            buildSearchBody({ fips, config, page: 1, pageSize: CANARY_ROW_CAP }),
          );
          return (res.data ?? []).slice(0, CANARY_ROW_CAP).map((p) => ({
            business_name: null,
            full_name: p.owner_std_name1_full ?? null,
            address: streetAddress(p),
            phone: null,
            source_meta: null,
          })) as CanaryRow[];
        } catch (err) {
          const status = err instanceof RealeflowError ? err.status : 0;
          const message = err instanceof Error ? err.message : String(err);
          // Licensing state, not an outage: never grey the type out for it.
          if (isEntitlementError(status, message)) return { skipped: message };
          throw err;
        }
      },
    },
  ];
}

type HealthRow = {
  template_id: string;
  status: HealthStatus;
  baseline: FillRates;
  consecutive_failures: number;
  last_healthy_at: string | null;
};

export type CanaryReport = {
  canary: string;
  status: HealthStatus;
  rows: number;
  templates: number;
  refundedJobs: number;
  notes: string;
};

export async function runTemplateHealthCanaries(): Promise<{ ok: true; reports: CanaryReport[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const reports: CanaryReport[] = [];

  for (const canary of canaries()) {
    if (canary.templateIds.length === 0) continue;
    let rows: CanaryRow[] = [];
    let hardError: string | null = null;
    let skipped: string | null = null;
    try {
      const result = await canary.run();
      if (Array.isArray(result)) rows = result;
      else skipped = result.skipped;
    } catch (err) {
      hardError = err instanceof Error ? err.message : String(err);
    }

    if (skipped) {
      reports.push({
        canary: canary.key,
        status: "healthy",
        rows: 0,
        templates: 0,
        refundedJobs: 0,
        notes: `Skipped: ${skipped}`,
      });
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from("template_health")
      .select("template_id, status, baseline, consecutive_failures, last_healthy_at")
      .in("template_id", canary.templateIds);
    const prior = new Map(
      ((existing ?? []) as unknown as HealthRow[]).map((r) => [r.template_id, r]),
    );

    // The baseline is shared across the canary's templates; take the first one
    // we have, so a newly added template inherits the adapter's known baseline.
    const sharedBaseline =
      ((existing ?? []) as unknown as HealthRow[]).find((r) => Object.keys(r.baseline ?? {}).length > 0)
        ?.baseline ?? {};

    const verdict = assess({ rows, baseline: sharedBaseline, hardError });
    const fill = computeFillRates(rows);
    const now = new Date().toISOString();
    let refundedJobs = 0;

    for (const templateId of canary.templateIds) {
      const before = prior.get(templateId);
      const fromStatus = before?.status ?? null;
      const failures =
        verdict.status === "healthy" ? 0 : (before?.consecutive_failures ?? 0) + 1;

      await supabaseAdmin.from("template_health").upsert(
        {
          template_id: templateId,
          status: verdict.status,
          last_check_at: now,
          last_healthy_at: verdict.status === "healthy" ? now : before?.last_healthy_at ?? null,
          row_count: rows.length,
          field_fill_rates: fill as never,
          baseline: verdict.nextBaseline as never,
          consecutive_failures: failures,
          notes: verdict.notes || null,
        } as never,
        { onConflict: "template_id" },
      );

      if (fromStatus === verdict.status) continue;

      // A transition into degraded or broken is the alert. Broken also refunds.
      let refunded = 0;
      if (verdict.status === "broken") {
        refunded = await refundRunsSinceHealthy(templateId, before?.last_healthy_at ?? null);
        refundedJobs += refunded;
      }

      await supabaseAdmin.from("template_health_events").insert({
        template_id: templateId,
        from_status: fromStatus,
        to_status: verdict.status,
        row_count: rows.length,
        refunded_jobs: refunded,
        detail: {
          canary: canary.key,
          label: canary.label,
          fill_rates: fill,
          baseline: sharedBaseline,
          degraded_fields: verdict.degradedFields,
          notes: verdict.notes,
        } as never,
      } as never);

      if (verdict.status !== "healthy") {
        console.error(
          `[template-health] ${templateId} ${fromStatus ?? "new"} -> ${verdict.status}: ${verdict.notes}`,
        );
      }
    }

    if (canary.key === "records.open_data") {
      await syncCountyCoverage(verdict.status);
    }

    reports.push({
      canary: canary.key,
      status: verdict.status,
      rows: rows.length,
      templates: canary.templateIds.length,
      refundedJobs,
      notes: verdict.notes,
    });
  }

  return { ok: true, reports };
}

/**
 * Auto-refund: every run that finished after the template was last verified
 * healthy was potentially charged for zero or degraded rows. Refunds go through
 * the idempotent ledger path, so re-running the canary can't double-refund.
 */
async function refundRunsSinceHealthy(templateId: string, lastHealthyAt: string | null): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = lastHealthyAt ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, workspace_id, params, created_by, created_at")
    .gte("created_at", since)
    .in("status", ["ready", "failed"])
    .limit(500);

  const { refundJobCredits } = await import("@/lib/pipeline.server");
  let count = 0;
  for (const job of (jobs ?? []) as Array<{
    id: string;
    workspace_id: string;
    params: Record<string, unknown> | null;
    created_by: string | null;
  }>) {
    if ((job.params as { template_id?: string } | null)?.template_id !== templateId) continue;
    const amount = await refundJobCredits(supabaseAdmin, {
      jobId: job.id,
      workspaceId: job.workspace_id,
      reason: "refund:template_broken",
      actorUserId: job.created_by,
    });
    if (amount <= 0) continue;
    count += 1;
    // Proactive: we caught it before they did, and the copy should say so.
    const { notifyRefund } = await import("@/lib/refunds.server");
    await notifyRefund(supabaseAdmin, {
      workspaceId: job.workspace_id,
      amount,
      reason: "refund:template_broken",
      jobId: job.id,
      proactive: true,
    });
  }
  return count;
}

/** Records coverage follows the open-data canary automatically. */
async function syncCountyCoverage(status: HealthStatus) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (status === "broken") {
    await supabaseAdmin
      .from("county_coverage")
      .update({ status: "unavailable", notes: "Automatically paused by the daily source health check." })
      .eq("source_type", "records")
      .eq("access_path", "open_data")
      .eq("status", "live");
    return;
  }
  if (status === "healthy") {
    await supabaseAdmin
      .from("county_coverage")
      .update({ status: "live", notes: null })
      .eq("source_type", "records")
      .eq("access_path", "open_data")
      .eq("status", "unavailable");
  }
}
