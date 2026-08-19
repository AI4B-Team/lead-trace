// ---------------------------------------------------------------------------
// The one pipeline. Both the interactive "Generate List" path and the recurring
// run engine call executePipeline, so a scheduled rescan is byte-for-byte the
// same work as a manual run: source -> dedupe -> verify -> trace -> scrub.
//
// Channel-aware: the phone stages (line-type check, skip trace, DNC scrub) only
// run for SMS lists. Email lists require a contact email; direct-mail lists
// require a mailing address and take no enrichment at all.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { RawLead } from "./data-providers";
import { normalizeChannel, channelUsesPhonePipeline, type Channel } from "./channels";
import type { LineType } from "./line-type";

type AnyClient = SupabaseClient<Database>;
type JobParams = Record<string, unknown>;

function digits(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

interface SourceAdapter {
  key: string;
  coverage: "live" | "beta" | "requested";
  run(
    params: JobParams,
    onProgress?: (message: string, count?: number) => Promise<void> | void,
    out?: AdapterOut,
  ): Promise<RawLead[]>;
}

/**
 * Side channel for what an adapter could and could not reach. The pipeline
 * reports it verbatim so a partially covered run never looks complete.
 */
type AdapterOut = {
  coverage?: {
    requested: number;
    ran: number;
    coveredCounties: string[];
    uncoveredCounties: string[];
    uncoveredPairs: Array<{ county: string; recordType: string }>;
  };
};

// No synthetic record generators live here. A source either returns real rows
// or the run fails with a reason the operator can act on. Sample data exists
// only in tests.

const businessAdapter: SourceAdapter = {
  key: "business.apify",
  coverage: "live",
  async run(params, onProgress) {
    const { getBusinessScraper, apifySourceForTemplate } = await import("./data-providers");
    // Yelp and LinkedIn templates run their own Apify actors; everything else
    // falls through to Google Maps.
    const scraper = getBusinessScraper(
      apifySourceForTemplate(params.templateId as string | undefined),
    );
    // A parameter file fans the same search out across every uploaded value.
    const targets = (params.scrape_targets as string[] | undefined) ?? [];
    const kind = params.scrape_target_kind as string | undefined;
    const niches =
      kind === "keywords" && targets.length
        ? targets
        : (params.niches as string[] | undefined) ?? ["HVAC"];
    const counties =
      kind === "areas" && targets.length
        ? targets
        : (params.counties as string[] | undefined) ?? [];
    return scraper.scrape({
      niches,
      counties,
      state: (params.state as string | undefined) ?? "FL",
      max_results: Number(params.max_results) > 0 ? Number(params.max_results) : null,
      onProgress,
    });
  },
};

/**
 * Distress Feed → leads. The feed itself is a maintained dataset that costs
 * nothing to browse; credits are only charged from here on, when the operator
 * pulls selected filings into their own leads for enrichment and skip trace.
 * Parcel APN and address ride along in source_meta so a parcel that also came
 * back from Street Scan dedupes onto ONE lead with both signals.
 */
const distressFeedAdapter: SourceAdapter = {
  key: "records.distress_feed",
  coverage: "live",
  async run(params, onProgress) {
    const ids = ((params.distress_record_ids as string[] | undefined) ?? []).filter(Boolean);
    if (!ids.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await onProgress?.(`Pulling ${ids.length} selected filings from the Distress Feed…`, ids.length);
    const { DISTRESS_ROW_COLUMNS, distressRowToLead } = await import("./distress/row-to-lead");
    const { data, error } = await supabaseAdmin
      .from("distress_records")
      .select(DISTRESS_ROW_COLUMNS)
      .in("id", ids);
    if (error) throw new Error(error.message);
    type Row = Record<string, string | number | null>;
    return ((data ?? []) as unknown as Row[]).map((r) => distressRowToLead(r));
  },
};

export const recordsAdapter: SourceAdapter = {
  key: "records.county",
  coverage: "live",
  async run(params, onProgress, out) {
    // Multi-select support (both axes): `counties`/`record_types` arrays are
    // the new shape; single `county`/`record_type` kept for backwards compat
    // with older queued/scheduled jobs.
    const counties = ((params.counties as string[] | undefined)?.filter(Boolean) ??
      [(params.county as string | undefined) ?? "Hillsborough, FL"]) as string[];
    const recordTypes =
      (params.record_types as string[] | undefined)?.filter(Boolean) ??
      [(params.record_type as string | undefined) ?? "Probate"];

    // Coverage gate first: a county/record type without a verified source is
    // never run and never faked. It is reported back and logged as demand.
    const { splitSelections } = await import("./distress/coverage.server");
    const split = await splitSelections(counties, recordTypes);
    if (out) {
      out.coverage = {
        requested: counties.length,
        ran: split.coveredCounties.length,
        coveredCounties: split.coveredCounties,
        uncoveredCounties: split.uncoveredCounties,
        uncoveredPairs: split.uncovered,
      };
    }
    if (!split.covered.length) {
      const { NoCoverageError } = await import("./distress/coverage.server");
      throw new NoCoverageError(
        `We don't cover ${counties.join(", ")} for ${recordTypes.join(", ")} yet. Your request is logged and no credits were spent.`,
      );
    }

    // Access-path preference for covered selections: hand-coded open-data
    // scrapers first, then any catalogued Socrata / ArcGIS / bulk file source.
    const { hasLiveCountyScraper, scrapeCountyRecords } = await import(
      "./data-providers/county-records"
    );
    const { fetchCatalogedRecords } = await import("./data-providers/source-registry.server");

    const all: RawLead[] = [];
    for (const county of split.coveredCounties) {
      const typesHere = split.covered.filter((p) => p.county === county).map((p) => p.recordType);
      const before = all.length;
      if (hasLiveCountyScraper(county)) {
        await onProgress?.(`Pulling live public records for ${county}…`);
        // One slice per record type (offset pagination) so multi-select pulls
        // distinct rows per type instead of the same page N times.
        for (let t = 0; t < typesHere.length; t++) {
          const slice = await scrapeCountyRecords({
            county,
            recordType: typesHere[t]!,
            offset: t * 25,
            dateFrom: (params.date_from as string | null | undefined) ?? null,
            dateTo: (params.date_to as string | null | undefined) ?? null,
          });
          all.push(...slice);
        }
        continue;
      }

      // Catalogued source for this county?
      let cataloged = 0;
      for (let t = 0; t < typesHere.length; t++) {
        const rows = await fetchCatalogedRecords({
          county,
          recordType: typesHere[t]!,
          offset: t * 25,
          dateFrom: (params.date_from as string | null | undefined) ?? null,
          dateTo: (params.date_to as string | null | undefined) ?? null,
        });
        if (rows && rows.length > 0) {
          if (cataloged === 0) await onProgress?.(`Pulling catalogued public records for ${county}…`);
          all.push(...rows);
          cataloged += rows.length;
        }
      }

      // Last resort: the county is verified because rows for it already live in
      // distress_records (licensed pulls, clerk intakes, reconciled surplus).
      // Without this the run passed the gate and returned zero.
      if (all.length === before) {
        const fallback = await pullDistressRecords({
          county,
          recordTypes: typesHere,
          dateFrom: (params.date_from as string | null | undefined) ?? null,
          dateTo: (params.date_to as string | null | undefined) ?? null,
          limit: Number(params.max_results) > 0 ? Number(params.max_results) : 200,
        });
        if (fallback.length) {
          await onProgress?.(
            `Pulling licensed records for ${county} from the distress feed…`,
            fallback.length,
          );
          all.push(...fallback);
        }
      }
    }
    return all;
  },
};

/**
 * Slug the picker uses → every spelling distress_records actually stores for it.
 * Ingest paths wrote provider-native names ("tax_lien", "tax_deed") for what the
 * picker calls Tax Default, so one canonical slug has to match several.
 */
const RECORD_TYPE_STORED_SLUGS: Record<string, string[]> = {
  tax_default: ["tax_default", "tax_lien", "tax_deed", "tax_delinquent"],
  pre_foreclosure: ["pre_foreclosure", "lis_pendens", "foreclosure_auction"],
};

/**
 * Reads distress_records for a county the coverage gate already marked
 * verified. Only verified FIPS are queried, and record types are matched on the
 * canonical slug the column actually stores.
 */
async function pullDistressRecords(args: {
  county: string;
  recordTypes: string[];
  dateFrom: string | null;
  dateTo: string | null;
  limit: number;
}): Promise<RawLead[]> {
  const { coveredFipsForCounty } = await import("./distress/coverage.server");
  const { recordTypeId } = await import("./record-types");
  const { DISTRESS_ROW_COLUMNS, distressRowToLead } = await import("./distress/row-to-lead");
  const { splitCountyLabel } = await import("./coverage.shared");

  const fips = new Set<string>();
  const slugs = new Set<string>();
  for (const recordType of args.recordTypes) {
    for (const f of await coveredFipsForCounty(args.county, recordType)) fips.add(f);
    const slug = recordTypeId(recordType);
    if (slug) for (const s of RECORD_TYPE_STORED_SLUGS[slug] ?? [slug]) slugs.add(s);
  }
  if (!fips.size || !slugs.size) return [];

  // distress_records keys geography by county + state; source_coverage keys it
  // by FIPS, and the two registries do not share a spelling. The FIPS lookup
  // above is the coverage assertion; the row filter is by county label.
  const { county, state } = splitCountyLabel(args.county);
  if (!county) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("distress_records")
    .select(DISTRESS_ROW_COLUMNS)
    .ilike("county", county)
    .in("record_type", [...slugs]);
  if (state) query = query.eq("state", state);
  if (args.dateFrom) query = query.gte("filed_date", args.dateFrom);
  if (args.dateTo) query = query.lte("filed_date", args.dateTo);
  const { data, error } = await query.limit(Math.min(Math.max(args.limit, 1), 5000));
  if (error) throw new Error(error.message);
  type Row = Record<string, string | number | null>;
  return ((data ?? []) as unknown as Row[]).map((r) => distressRowToLead(r));
}

/**
 * Street Scan. Parcel imagery scoring has no verified provider wired yet, so it
 * refuses to run rather than invent scored parcels.
 */
const propertyScanAdapter: SourceAdapter = {
  key: "street_scan.parcels",
  coverage: "requested",
  async run(params) {
    const counties = ((params.counties as string[] | undefined)?.filter(Boolean) ?? []) as string[];
    const { NoCoverageError } = await import("./distress/coverage.server");
    throw new NoCoverageError(
      counties.length
        ? `Street Scan has no verified parcel imagery coverage for ${counties.join(", ")} yet. Your request is logged and no credits were spent.`
        : "Street Scan has no verified parcel imagery coverage yet. Your request is logged and no credits were spent.",
    );
  },
};

const uploadAdapter: SourceAdapter = {
  key: "upload.csv",
  coverage: "live",
  async run(params) {
    const parsed = params.rows as RawLead[] | undefined;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    throw new Error(
      "We couldn't read any rows from that file. Check the column mapping and upload it again — no credits were spent.",
    );
  },
};

/**
 * Idempotent credit refund for one run. Derives what to give back from the
 * ledger itself (every debit this job wrote), and refuses to write a second
 * refund row for the same job + kind + reason — so a retry, a failure handler,
 * and the Template Health Agent can all call this without double-refunding.
 */
export async function refundJobCredits(
  supabase: AnyClient,
  args: { jobId: string; workspaceId: string; reason: string; actorUserId?: string | null },
): Promise<number> {
  const { data: rows } = await supabase
    .from("credit_ledger")
    .select("kind, delta, reason")
    .eq("job_id", args.jobId);
  const ledger = (rows ?? []) as Array<{ kind: string; delta: number; reason: string | null }>;

  const owed = new Map<string, number>();
  for (const row of ledger) {
    if (row.delta < 0) owed.set(row.kind, (owed.get(row.kind) ?? 0) + Math.abs(row.delta));
  }

  const { applyCreditDelta } = await import("./credits.server");
  let refunded = 0;
  for (const [kind, amount] of owed) {
    if (amount <= 0) continue;
    const already = ledger.some((r) => r.kind === kind && r.reason === args.reason);
    if (already) continue;
    await applyCreditDelta(supabase, {
      workspaceId: args.workspaceId,
      kind,
      delta: amount,
      reason: args.reason,
      jobId: args.jobId,
      actorUserId: args.actorUserId ?? null,
    });
    refunded += amount;
  }
  return refunded;
}

function selectAdapter(sourceType: string): SourceAdapter {
  if (sourceType === "business") return businessAdapter;
  if (sourceType === "records") return recordsAdapter;
  if (sourceType === "street_scan") return propertyScanAdapter;
  if (sourceType === "distress_feed") return distressFeedAdapter;
  return uploadAdapter;
}

/** Every dedupe key a record can be recognized by across runs. */
function leadKeys(r: {
  phone?: unknown;
  email?: unknown;
  business_name?: unknown;
  full_name?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  source_meta?: unknown;
}): string[] {
  const keys: string[] = [];
  // Parcel identity first: the same house can arrive from the Distress Feed
  // (probate filed) and from Street Scan (tarp detected). One parcel is ONE
  // lead carrying both signals — never two leads, never two charges, never two
  // campaigns texting the same owner.
  const meta = (r.source_meta ?? {}) as Record<string, unknown>;
  const apn = norm(meta.parcel_apn ?? meta.apn);
  if (apn) keys.push(`apn:${norm(r.state)}|${apn}`);
  const addr = norm(r.address);
  if (addr) keys.push(`a:${addr}|${norm(r.zip ?? r.city)}|${norm(r.state)}`);
  const d = digits(r.phone);
  if (d) keys.push(`p:${d}`);
  if (typeof r.email === "string" && r.email.trim()) keys.push(`e:${r.email.trim().toLowerCase()}`);
  const name = norm(r.business_name ?? r.full_name);
  if (name) keys.push(`n:${name}|${norm(r.address)}|${norm(r.city)}|${norm(r.state)}`);
  return keys;
}

export type PipelineResult = {
  ok: true;
  status: "ready";
  total: number;
  clean: number;
  dnc: number;
  litigator: number;
  /** Records this run surfaced that no prior run of the same list had. */
  netNew: number;
  /** Everything the source matched before net-new dedupe. */
  matched: number;
  channel: Channel;
};

type PipelineDebit = { kind: "scrape" | "skip_trace" | "sms"; amount: number };
type PipelineCtx = {
  stage: string;
  debits: PipelineDebit[];
  workspaceId: string | null;
  actorUserId: string | null;
};

/** Never let a provider token or key reach a column workspace members can read. */
function sanitizeError(message: string): string {
  return message
    .replace(/(token|key|secret|password|authorization|bearer)([=:\s"']+)[^\s"'&,)]+/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .slice(0, 500);
}

/**
 * Public entry point. Wraps the pipeline so any throw lands the list in a real
 * terminal `failed` state, refunds credits this run already debited, and still
 * re-throws for callers (runJob, the recurring engine).
 */
export async function executePipeline(
  supabase: AnyClient,
  jobId: string,
  opts: { priorRunJobIds?: string[] } = {},
): Promise<PipelineResult | { ok: true; status: string }> {
  const ctx: PipelineCtx = { stage: "queued", debits: [], workspaceId: null, actorUserId: null };
  try {
    return await runPipelineBody(supabase, jobId, opts, ctx);
  } catch (err) {
    const message = sanitizeError(err instanceof Error ? err.message : String(err));
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: message,
        failed_stage: ctx.stage,
        failed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (ctx.workspaceId) {
      await supabase.from("job_events").insert({
        job_id: jobId,
        workspace_id: ctx.workspaceId,
        stage: "failed",
        message: `Run failed during ${ctx.stage}: ${message}`,
        count: null,
      });

      // Refund every debit this run made. Keyed on job + kind + reason so a
      // retry can never double-refund.
      let refundedTotal = 0;
      for (const debit of ctx.debits) {
        if (debit.amount <= 0) continue;
        const { data: already } = await supabase
          .from("credit_ledger")
          .select("id")
          .eq("job_id", jobId)
          .eq("kind", debit.kind)
          .eq("reason", "refund:job_failed")
          .maybeSingle();
        if (already) continue;
        const { applyCreditDelta } = await import("./credits.server");
        await applyCreditDelta(supabase, {
          workspaceId: ctx.workspaceId,
          kind: debit.kind,
          delta: debit.amount,
          reason: "refund:job_failed",
          jobId: jobId,
          actorUserId: ctx.actorUserId,
        });
        refundedTotal += debit.amount;
      }

      // Never refund silently: tell the customer what broke and what we gave back.
      if (refundedTotal > 0) {
        const { notifyRefund } = await import("./refunds.server");
        await notifyRefund(supabase, {
          workspaceId: ctx.workspaceId,
          amount: refundedTotal,
          reason: "refund:job_failed",
          jobId,
        });
      }
    }
    throw err;
  }
}

/**
 * Advance a queued job all the way to `ready`.
 *
 * `priorRunJobIds` makes a recurring run net-new only: every record already
 * delivered by an earlier run of the SAME list is dropped before any credit is
 * spent on enrichment or scrubbing.
 */
async function runPipelineBody(
  supabase: AnyClient,
  jobId: string,
  opts: { priorRunJobIds?: string[] } = {},
  ctx: PipelineCtx = { stage: "queued", debits: [], workspaceId: null, actorUserId: null },
): Promise<PipelineResult | { ok: true; status: string }> {
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, workspace_id, source_type, status, params, channel, parent_job_id, created_by")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) throw new Error("List Not Found");
  if (job.status !== "queued") return { ok: true, status: job.status as string };

  const workspaceId = job.workspace_id as string;
  // Every credit debit is attributed to the member who created the list, so a
  // scheduled rescan still lands on a person rather than "system".
  const actorUserId = (job.created_by as string | null) ?? null;
  ctx.workspaceId = workspaceId;
  ctx.actorUserId = actorUserId;
  const params = (job.params ?? {}) as JobParams;
  const channel = normalizeChannel(job.channel as string | null);
  const phonePipeline = channelUsesPhonePipeline(channel);

  const say = async (stage: string, message: string, count?: number) => {
    ctx.stage = stage;
    await supabase.from("job_events").insert({
      job_id: jobId,
      workspace_id: workspaceId,
      stage,
      message,
      count: count ?? null,
    });
  };
  await say("queued", "Run accepted — we'll keep working even if you close this tab.");

  // Free plan boundary: sources that cost per lead, and skip trace, need a
  // payment method. Checked here so every entry point (assistant, recurring
  // engine, API) hits the same gate.
  const { assertFreeTierAllows } = await import("./free-tier.server");
  const { getTemplate, creditCostPerLead } = await import("./templates");
  const freePlanCtx = await assertFreeTierAllows(supabase, workspaceId, {
    templateId: (params.templateId as string | undefined) ?? null,
    creditCostPerLead: (() => {
      const t = getTemplate((params.templateId as string | undefined) ?? "");
      return t ? creditCostPerLead(t) : 0;
    })(),
    skipTrace: Boolean(params.skip_trace),
    recordsRequested: (params.distress_record_ids as string[] | undefined)?.length ?? 0,
  });

  // Distress Feed pulls draw down the Free allowance as soon as they are
  // accepted, so two parallel runs can't both slip past the 50-record ceiling.
  const pulledRecordIds = (params.distress_record_ids as string[] | undefined) ?? [];
  if (pulledRecordIds.length > 0) {
    const { consumeFreeRecords } = await import("./free-tier.server");
    await consumeFreeRecords(supabase, workspaceId, pulledRecordIds.length, freePlanCtx);
  }

  // 1) SOURCE ---------------------------------------------------------------
  await supabase.from("jobs").update({ status: "scraping" }).eq("id", jobId);
  await say("scraping", "Searching the source for matching records…");
  const adapter = selectAdapter(job.source_type as string);
  const out: AdapterOut = {};
  const sourced = await adapter.run(
    params,
    (message, count) => say("scraping", message, count),
    out,
  );
  const maxResults = Number(params.max_results) > 0 ? Number(params.max_results) : null;
  const raw = maxResults ? sourced.slice(0, maxResults) : sourced;

  // Partial coverage is stated outright, and the gap is logged as demand so the
  // roadmap is driven by what operators actually asked for.
  const cov = out.coverage;
  if (cov) {
    await supabase
      .from("jobs")
      .update({ rows_in: raw.length, params: { ...params, coverage: cov } as never })
      .eq("id", jobId);
    if (cov.uncoveredPairs.length > 0) {
      const { logCoverageRequests } = await import("./distress/coverage.server");
      await logCoverageRequests(cov.uncoveredPairs, { workspaceId, requestedBy: actorUserId });
      await say(
        "scraping",
        `Ran ${cov.ran} of ${cov.requested} selected counties. ${cov.uncoveredCounties.length} not yet covered — we've logged your request.`,
      );
    }
  } else {
    await supabase.from("jobs").update({ rows_in: raw.length }).eq("id", jobId);
  }
  await say("scraping", `Found ${raw.length.toLocaleString()} records.`, raw.length);
  if (raw.length === 0 && cov && cov.ran > 0) {
    // Covered, just nothing new. Say so, and prove the pipe is alive.
    const { verifiedCoverage } = await import("./distress/coverage.server");
    const rows = await verifiedCoverage();
    const last = rows
      .map((r) => r.last_success_at)
      .filter(Boolean)
      .sort()
      .pop();
    await say(
      "scraping",
      `No new records in ${cov.coveredCounties.join(", ")} for this date range.${
        last ? ` Last successful pull ${new Date(last).toLocaleString()}.` : ""
      }`,
    );
  }

  // 2) DEDUPE — in-batch, workspace-wide, and against every prior run --------
  await supabase.from("jobs").update({ status: "enriching" }).eq("id", jobId);
  const removeFranchises = params.remove_franchises === true;
  const dedupe = params.dedupe !== false;
  const seen = new Set<string>();
  const priorRunKeys = new Set<string>();

  // Workspace suppression: opt-outs and uploaded exclusion files never come back.
  const suppressed = new Set<string>();
  {
    const { fetchAllPages } = await import("./pg-page.server");
    const sup = await fetchAllPages((from, to) =>
      supabase.from("suppression").select("phone").eq("workspace_id", workspaceId).order("phone").range(from, to),
    );
    for (const row of sup) {
      const d = digits((row as { phone: string }).phone);
      if (d) suppressed.add(d);
    }
  }

  const priorIds = opts.priorRunJobIds ?? [];
  if (priorIds.length) {
    // Net-new engine: everything an earlier run of this list already delivered.
    const { fetchAllPages } = await import("./pg-page.server");
    const prior = await fetchAllPages((from, to) =>
      supabase
        .from("leads")
        .select("phone, email, business_name, full_name, address, city, state")
        .in("job_id", priorIds)
        .order("id")
        .range(from, to),
    );
    for (const row of prior) for (const k of leadKeys(row)) priorRunKeys.add(k);
  }

  if (dedupe) {
    const { fetchAllPages } = await import("./pg-page.server");
    const existing = await fetchAllPages((from, to) =>
      supabase
        .from("leads")
        .select("phone")
        .eq("workspace_id", workspaceId)
        .not("phone", "is", null)
        .order("phone")
        .range(from, to),
    );
    for (const row of existing) {
      const d = digits(row.phone);
      if (d) seen.add(`p:${d}`);
    }
  }

  const deduped: RawLead[] = [];
  let repeatFromPriorRuns = 0;
  let suppressedCount = 0;
  for (const r of raw) {
    const meta = (r.source_meta ?? {}) as { franchise?: boolean };
    if (removeFranchises && meta.franchise) continue;
    if (suppressed.size) {
      const d = digits(r.phone ?? "");
      if (d && suppressed.has(d)) { suppressedCount++; continue; }
    }
    const keys = leadKeys(r);
    if (priorRunKeys.size && keys.some((k) => priorRunKeys.has(k))) {
      repeatFromPriorRuns++;
      continue;
    }
    if (dedupe) {
      if (keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
    }
    deduped.push(r);
  }
  if (suppressedCount > 0) {
    await say(
      "enriching",
      `Excluded ${suppressedCount.toLocaleString()} records on your workspace suppression list.`,
      suppressedCount,
    );
  }
  await supabase
    .from("jobs")
    .update({ rows_deduped: deduped.length, net_new_count: deduped.length })
    .eq("id", jobId);
  const removedCount = raw.length - deduped.length;
  await say(
    "enriching",
    priorIds.length
      ? `${repeatFromPriorRuns.toLocaleString()} records were already delivered by earlier runs of this list — ${deduped.length.toLocaleString()} are new since last time.`
      : `Removed ${removedCount.toLocaleString()} ${
          removeFranchises ? "duplicates and franchise locations" : "duplicates"
        } — ${deduped.length.toLocaleString()} unique records remain.`,
    deduped.length,
  );

  // 2b) CHANNEL GATE --------------------------------------------------------
  type EnrichedLead = RawLead & { line_type?: LineType };
  let verified: EnrichedLead[] = deduped;
  let skiptraced = 0;

  if (!phonePipeline) {
    // Email lists need a contact email; direct mail needs a mailing address.
    if (channel === "email") {
      const before = verified.length;
      verified = verified.filter((r) => typeof r.email === "string" && r.email.includes("@"));
      await say(
        "enriching",
        `Contact email found for ${verified.length.toLocaleString()} records — ${(before - verified.length).toLocaleString()} had no reachable email.`,
        verified.length,
      );
    } else {
      const before = verified.length;
      verified = verified.filter((r) => Boolean(r.address && (r.zip || r.city)));
      await say(
        "enriching",
        `Mailing address verified for ${verified.length.toLocaleString()} records — ${(before - verified.length).toLocaleString()} had no deliverable address.`,
        verified.length,
      );
    }
    await supabase
      .from("jobs")
      .update({ rows_enriched: verified.length, rows_skiptraced: 0 })
      .eq("id", jobId);
  } else {
    const { verifyPending, verifyLineTypes, verifyNewlyTraced, classifyLineType } = await import(
      "./line-type"
    );
    const shouldSkiptrace =
      job.source_type === "records" ||
      ((job.source_type === "upload" || job.source_type === "business") &&
        params.skip_trace !== false);
    const mobileOnly = params.mobile_only === true;
    const verify = shouldSkiptrace
      ? verifyPending(deduped, mobileOnly)
      : verifyLineTypes(deduped, mobileOnly);
    verified = verify.kept;
    const pendingPhone = verified.filter((r) => !(r.phone ?? "").replace(/\D/g, "")).length;
    await supabase.from("jobs").update({ rows_enriched: verified.length }).eq("id", jobId);
    await say(
      "enriching",
      mobileOnly
        ? pendingPhone > 0
          ? `Carrier check: ${(verified.length - pendingPhone).toLocaleString()} mobile, ${verify.removed.toLocaleString()} landline or VoIP removed, ${pendingPhone.toLocaleString()} still awaiting a number from skip trace.`
          : verify.removed > 0
          ? `Carrier check removed ${verify.removed.toLocaleString()} landline and VoIP numbers — ${verified.length.toLocaleString()} records remain.`
          : `Carrier check confirmed every number is mobile — ${verified.length.toLocaleString()} records remain.`
        : `Carrier check complete — ${verify.counts.mobile.toLocaleString()} mobile, ${(verify.counts.landline + verify.counts.voip).toLocaleString()} landline or VoIP.`,
      verified.length,
    );

    // 3) SKIPTRACE ----------------------------------------------------------
    await supabase.from("jobs").update({ status: "skiptracing" }).eq("id", jobId);
    let awaitingTrace = 0;
    // Rows kept with a blank phone because they are property leads (address +
    // owner) and no paid phone vendor is connected yet.
    let keptPhoneless = 0;
    let tracedNoPhone = 0;
    if (shouldSkiptrace) {
      // Records leads go through the skip-trace provider (default
      // "realeflow-semi": Realeflow Property Data API → assessor owner name +
      // MAILING address + value/equity, stacked into source_meta.realeflow for
      // the lead drawer). Eligible rows = live-scraper rows (source_meta
      // .provider) AND distress_records fallback rows (source_meta.source ===
      // "distress_feed"), both of which carry a property address.
      const { hasTraceableRecordsRows, isTraceableRecordsLead, MAX_LIVE_TRACES } = await import(
        "./skiptrace/traceable"
      );
      const isRealRecords = job.source_type === "records" && hasTraceableRecordsRows(verified);
      if (isRealRecords) {
        const { getSkipTraceProvider } = await import("./skiptrace/provider.server");
        const provider = getSkipTraceProvider();
        let traceCalls = 0;
        let consecutiveFailures = 0;
        for (const r of verified) {
          if (!isTraceableRecordsLead(r)) continue;
          if ((r.phone ?? "").replace(/\D/g, "")) continue;
          // Per-invocation subrequest budget: everything past the slice is
          // reported as awaiting the next pass, never as "dropped".
          if (traceCalls >= MAX_LIVE_TRACES || consecutiveFailures >= 3) {
            awaitingTrace++;
            continue;
          }
          traceCalls++;
          try {
            const t = await provider.trace({
              ownerName: r.full_name ?? null,
              street: r.address ?? null,
              city: r.city ?? null,
              state: r.state ?? null,
              zip: r.zip ?? null,
            });
            if (t.ownerName && !r.full_name) r.full_name = t.ownerName;
            if (!r.phone && t.phones[0]) {
              r.phone = t.phones[0];
              r.line_type = classifyLineType(t.phones[0]);
            } else if (!r.phone) {
              // Semi-trace (mailing address only) — no phone came back.
              tracedNoPhone++;
            }
            r.source_meta = {
              ...(r.source_meta ?? {}),
              realeflow: {
                provider: t.provider,
                address_hash: t.addressHash,
                owner_name: t.ownerName,
                mailing_street: t.mailingStreet,
                mailing_city: t.mailingCity,
                mailing_state: t.mailingState,
                mailing_zip: t.mailingZip,
                absentee_owner: t.absenteeOwner,
                ...t.extras,
                traced_at: t.tracedAt,
              },
            };
            if (r.phone) skiptraced++;
            consecutiveFailures = 0;
          } catch {
            // No property match / subrequest budget hit — keep the lead as-is.
            consecutiveFailures++;
          }
        }
      }
      // Records with no trace match keep no phone. We never invent one.
    }
    // Credits: only a trace that actually produced a phone number is billable
    // skip trace. A semi-trace that returned mailing data only is not charged.
    if (skiptraced > 0) {
      const { applyCreditDelta } = await import("./credits.server");
      await applyCreditDelta(supabase, {
        workspaceId,
        kind: "skip_trace",
        delta: -skiptraced,
        reason: "skiptrace",
        jobId,
        actorUserId,
      });
      ctx.debits.push({ kind: "skip_trace", amount: skiptraced });
    }
    await supabase.from("jobs").update({ rows_skiptraced: skiptraced }).eq("id", jobId);
    await say(
      "skiptracing",
      skiptraced > 0
        ? awaitingTrace > 0
          ? `Skip traced ${skiptraced.toLocaleString()} records that were missing a phone number — ${awaitingTrace.toLocaleString()} still awaiting skip trace on the next pass.`
          : `Skip traced ${skiptraced.toLocaleString()} records that were missing a phone number.`
        : tracedNoPhone > 0
        ? `No phone vendor connected yet — kept ${tracedNoPhone.toLocaleString()} property ${
            tracedNoPhone === 1 ? "record" : "records"
          } with mailing address only.`
        : awaitingTrace > 0
        ? `${awaitingTrace.toLocaleString()} records are awaiting skip trace on the next pass.`
        : "No skip tracing needed — every record already had a phone number.",
      skiptraced,
    );

    if (mobileOnly) {
      // Distress/live-records property rows survive the gate phone-blank; every
      // other phoneless row (uploads, business lists) still drops as before.
      const { isTraceableRecordsLead } = await import("./skiptrace/traceable");
      const keepPhoneless =
        job.source_type === "records" ? (row: (typeof verified)[number]) => isTraceableRecordsLead(row) : undefined;
      // Rows that already passed as mobile are never re-checked here — skip
      // trace only appends numbers to rows that had none, so the second pass
      // evaluates ONLY those rows.
      const finalGate = verifyNewlyTraced(verified, true, { keepPhoneless });
      const removedTotal = finalGate.removedNotMobile + finalGate.removedNoPhone;
      verified = finalGate.kept;
      keptPhoneless = finalGate.keptPhonelessProperty;
      if (finalGate.evaluated > 0) {
        const parts: string[] = [];
        if (keptPhoneless > 0) {
          parts.push(
            `kept ${keptPhoneless.toLocaleString()} property ${
              keptPhoneless === 1 ? "lead" : "leads"
            } with the phone blank (mailing address only)`,
          );
        }
        if (finalGate.removedNotMobile > 0) {
          parts.push(
            `removed ${finalGate.removedNotMobile.toLocaleString()} ${
              finalGate.removedNotMobile === 1 ? "number" : "numbers"
            } that came back landline or VoIP`,
          );
        }
        if (finalGate.removedNoPhone > 0) {
          const deferred = Math.min(awaitingTrace, finalGate.removedNoPhone);
          const dropped = finalGate.removedNoPhone - deferred;
          if (deferred > 0) {
            parts.push(
              `${deferred.toLocaleString()} ${
                deferred === 1 ? "record is" : "records are"
              } awaiting skip trace on the next pass`,
            );
          }
          if (dropped > 0) {
            parts.push(
              `${dropped.toLocaleString()} ${
                dropped === 1 ? "record" : "records"
              } still had no phone number after skip trace and were dropped`,
            );
          }
        }
        await say(
          "enriching",
          removedTotal > 0 || keptPhoneless > 0
            ? `Final carrier check on ${finalGate.evaluated.toLocaleString()} pending ${
                finalGate.evaluated === 1 ? "record" : "records"
              }: ${parts.join("; ")} — ${verified.length.toLocaleString()} records remain.`
            : `Carrier check confirmed the ${finalGate.evaluated.toLocaleString()} newly traced ${
                finalGate.evaluated === 1 ? "number is" : "numbers are"
              } mobile — ${verified.length.toLocaleString()} records remain.`,
          verified.length,
        );
      }
      await supabase.from("jobs").update({ rows_enriched: verified.length }).eq("id", jobId);
    }
  }

  // 4) INSERT LEADS ---------------------------------------------------------
  const { data: jobProvenance } = await supabase
    .from("jobs")
    .select("data_provenance")
    .eq("id", jobId)
    .maybeSingle();
  const leadRows = verified.map((r) => ({
    workspace_id: workspaceId,
    job_id: jobId,
    full_name: r.full_name ?? null,
    business_name: r.business_name ?? null,
    phone: r.phone ?? null,
    phone_type: r.phone ? (r.line_type ?? "unknown") : "unknown",
    email: r.email ?? null,
    address: r.address ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    zip: r.zip ?? null,
    source_meta: (r.source_meta ?? {}) as never,
    scrub_status: "unscrubbed" as const,
    data_provenance:
      (jobProvenance as { data_provenance?: string } | null)?.data_provenance ?? "verified_source",
  }));
  for (let i = 0; i < leadRows.length; i += 500) {
    await supabase.from("leads").insert(leadRows.slice(i, i + 500));
  }

  // Credits are only ever charged for the records this run actually kept —
  // which, on a recurring run, is the net-new set.
  {
    const { applyCreditDelta } = await import("./credits.server");
    await applyCreditDelta(supabase, {
      workspaceId,
      kind: "scrape",
      delta: -verified.length,
      reason: "scrape",
      jobId,
      actorUserId,
    });
  }
  ctx.debits.push({ kind: "scrape", amount: verified.length });

  // 5) SCRUB — SMS only. Email/direct-mail files are not phone campaigns. ----
  const { data: inserted } = await supabase.from("leads").select("id, phone").eq("job_id", jobId);
  let clean = 0;
  let dnc = 0;
  let litigator = 0;
  let unknownScrub = 0;

  if (phonePipeline) {
    await supabase.from("jobs").update({ status: "scrubbing" }).eq("id", jobId);
    if ((inserted?.length ?? 0) === 0) {
      // Never imply a compliance check ran on nothing.
      await say("scrubbing", "Skipped — no records reached this stage.", 0);
    } else {
    await say("scrubbing", "Scrubbing against the National DNC Registry and known litigators…");
    const { getDncScrubber } = await import("./data-providers");
    const scrubber = getDncScrubber();
    const phones = (inserted ?? []).map((l) => l.phone ?? "").filter(Boolean);
    const scrubResult = await scrubber.scrub(phones);
    const byPhone = new Map(scrubResult.results.map((r) => [r.phone, r.status]));
    for (const lead of inserted ?? []) {
      // Fail closed: a phone the provider did not return a verdict for is
      // 'unknown', never 'clean'. Unknown numbers are not campaignable.
      //
      // Phoneless property leads (records/property runs with a blank phone) have
      // no number to scrub, so they stay 'unknown' — an HONEST verdict, not a
      // fake 'clean'. They remain deliverable for mail/knock and are browsable
      // under the "Property (No Phone)" bucket; they simply are not counted as
      // DNC-scrubbed textable leads until a phone vendor is connected and the
      // number is really scrubbed.
      const status = (lead.phone ? byPhone.get(lead.phone) : undefined) ?? "unknown";
      if (status === "litigator") litigator++;
      else if (status === "dnc") dnc++;
      else if (status === "clean") clean++;
      else unknownScrub++;
      await supabase.from("leads").update({ scrub_status: status }).eq("id", lead.id);
    }
    await supabase.from("scrub_runs").insert({
      workspace_id: workspaceId,
      job_id: jobId,
      provider: scrubResult.provider,
      total: inserted?.length ?? 0,
      clean_count: clean,
      dnc_count: dnc,
      litigator_count: litigator,
      proof: scrubResult.proof as never,
    });
    await say(
      "scrubbing",
      `${dnc.toLocaleString()} numbers flagged DNC and ${litigator.toLocaleString()} flagged as known litigators.` +
        (unknownScrub > 0
          ? ` ${unknownScrub.toLocaleString()} came back without a verdict and are held back from campaigns.`
          : ""),
      dnc + litigator + unknownScrub,
    );
    }
  } else {
    clean = inserted?.length ?? 0;
    for (let i = 0; i < (inserted ?? []).length; i += 500) {
      const chunk = (inserted ?? []).slice(i, i + 500).map((l) => l.id);
      await supabase.from("leads").update({ scrub_status: "clean" }).in("id", chunk);
    }
    await say(
      "scrubbing",
      channel === "email"
        ? "DNC and litigator scrubbing does not apply to an email list — no phone numbers are used."
        : "DNC and litigator scrubbing does not apply to a direct-mail list — no phone numbers are used.",
      clean,
    );
  }

  // 6) READY ----------------------------------------------------------------
  await supabase.from("jobs").update({ status: "ready" }).eq("id", jobId);
  // Property leads kept with a blank phone: real address + owner, no phone
  // vendor connected yet. They are deliverable for mail/knock, not for SMS, and
  // are NOT counted in `clean` (they have no scrubbed number). The narration
  // reports them alongside the clean count so the run reads honestly.
  const phoneBlankProperty =
    job.source_type === "records" ? (inserted ?? []).filter((l) => !l.phone).length : 0;
  await say(
    "ready",
    channel === "email"
      ? `${clean.toLocaleString()} records with contact emails are ready to export.`
      : channel === "direct_mail"
        ? `${clean.toLocaleString()} mailable records are ready to export.`
        : phoneBlankProperty > 0
          ? `${clean.toLocaleString()} clean, textable ${clean === 1 ? "lead" : "leads"} and ${phoneBlankProperty.toLocaleString()} property ${
              phoneBlankProperty === 1 ? "lead" : "leads"
            } with the phone blank (add a phone vendor to text them). Browse the phone-blank rows under Property (No Phone).`
          : `${clean.toLocaleString()} clean, textable leads are ready.`,
    clean + phoneBlankProperty,
  );

  // 7) EVENTS ---------------------------------------------------------------
  const { emitEvent } = await import("./events.server");
  const { logActivity } = await import("./activity.server");
  await logActivity(supabase, workspaceId, {
    type: "run_completed",
    summary: `List Run Completed — ${clean.toLocaleString()} Clean`,
    detail: `${deduped.length.toLocaleString()} Net-New Of ${(inserted?.length ?? 0).toLocaleString()} Processed`,
    refId: jobId,
    refType: "list",
    actorId: actorUserId,
  });
  await emitEvent(supabase, workspaceId, "job.completed", {
    job_id: jobId,
    source_type: job.source_type,
    channel,
    total: inserted?.length ?? 0,
    clean,
    dnc,
    litigator,
    net_new: deduped.length,
  });
  if (clean > 0) {
    await emitEvent(supabase, workspaceId, "lead.new", { job_id: jobId, count: clean });
  }
  if (dnc > 0)
    await emitEvent(supabase, workspaceId, "lead.flagged_dnc", { job_id: jobId, count: dnc });
  if (litigator > 0) {
    await emitEvent(supabase, workspaceId, "lead.flagged_litigator", {
      job_id: jobId,
      count: litigator,
    });
  }

  return {
    ok: true,
    status: "ready",
    clean,
    dnc,
    litigator,
    total: inserted?.length ?? 0,
    netNew: deduped.length,
    matched: raw.length,
    channel,
  };
}
