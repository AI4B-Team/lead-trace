import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdmin } from "./access-checks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  if (!(await isSuperAdmin(supabase, userId))) throw new Error("Forbidden");
}

// ── Discovered data sources ────────────────────────────────────────────────

export const listDataSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("data_sources")
      .select(
        "id, platform, domain, dataset_id, resource_url, title, jurisdiction, county_name, state, record_type, status, field_map, last_error, last_verified_at, discovered_at",
      )
      .order("discovered_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { sources: data ?? [] };
  });

/** Sweep the open-data catalog for one record type and store new matches. */
export const discoverDataSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ recordType: z.string().min(2), limit: z.number().int().min(5).max(100).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { discoverSocrataSources } = await import("./data-providers/socrata");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const found = await discoverSocrataSources(data.recordType as never, { limit: data.limit ?? 40 });
    if (found.length === 0) return { found: 0, saved: 0 };
    const { data: saved, error } = await supabaseAdmin
      .from("data_sources")
      .upsert(
        found.map((f) => ({
          platform: f.platform,
          domain: f.domain,
          dataset_id: f.dataset_id,
          resource_url: f.resource_url,
          title: f.title,
          jurisdiction: f.jurisdiction,
          county_name: f.county_name,
          state: f.state,
          record_type: f.record_type,
          field_map: f.field_map,
          status: "discovered",
        })),
        { onConflict: "platform,domain,dataset_id,record_type", ignoreDuplicates: false },
      )
      .select("id");
    if (error) throw new Error(error.message);
    return { found: found.length, saved: (saved ?? []).length };
  });

/** Catalog an ArcGIS feature layer by probing its schema. */
export const addArcgisSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        layerUrl: z.string().url(),
        recordType: z.string().min(2),
        countyName: z.string().min(2),
        state: z.string().length(2),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { probeArcgisLayer } = await import("./data-providers/arcgis");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const probe = await probeArcgisLayer(data.layerUrl);
    const { error } = await supabaseAdmin.from("data_sources").upsert(
      {
        platform: "arcgis",
        domain: new URL(data.layerUrl).host,
        dataset_id: data.layerUrl.split("/").slice(-2).join("/"),
        resource_url: data.layerUrl,
        title: probe.title ?? data.layerUrl,
        jurisdiction: data.countyName,
        county_name: data.countyName,
        state: data.state.toUpperCase(),
        record_type: data.recordType,
        field_map: probe.field_map,
        status: probe.usable ? "verified" : "discovered",
        last_error: probe.usable ? null : "No Address Field Detected — Map Columns Manually",
      },
      { onConflict: "platform,domain,dataset_id,record_type" },
    );
    if (error) throw new Error(error.message);
    return { usable: probe.usable, columns: probe.columns, fieldMap: probe.field_map };
  });

export const setDataSourceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["discovered", "verified", "enabled", "disabled", "failed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("data_sources")
      .update({ status: data.status, last_error: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Agencies and public records requests ──────────────────────────────────

export const listAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: agencies }, { data: requests }, { data: files }] = await Promise.all([
      supabaseAdmin
        .from("agency_contacts")
        .select(
          "id, agency_name, department, county_name, state, contact_name, contact_title, email, phone, record_types, response_format, avg_turnaround_days, responsive, notes",
        )
        .order("state")
        .order("agency_name"),
      supabaseAdmin
        .from("records_requests")
        .select("id, agency_id, record_types, cadence, status, last_sent_at, last_received_at, next_send_at, last_error, subject, body"),
      supabaseAdmin
        .from("records_request_files")
        .select(
          "id, agency_id, filename, rows_total, rows_parsed, parse_status, parse_error, received_at, detected_columns, sample_rows",
        )
        .order("received_at", { ascending: false })
        .limit(100),
    ]);
    return { agencies: agencies ?? [], requests: requests ?? [], files: files ?? [] };
  });

/**
 * Apply a human's column mapping to a file we could not read, remember it for
 * the agency, and re-ingest the stored contents.
 */
export const remapReturnedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fileId: z.string().uuid(),
        columnMap: z.record(z.string(), z.string()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { remapAndReingestFile } = await import("./records-requests.server");
    return remapAndReingestFile({
      fileId: data.fileId,
      columnMap: data.columnMap,
      userId: context.userId,
    });
  });

export const upsertAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        agencyName: z.string().min(2).max(200),
        department: z.string().max(200).optional().nullable(),
        countyName: z.string().max(120).optional().nullable(),
        state: z.string().length(2),
        contactName: z.string().max(120).optional().nullable(),
        contactTitle: z.string().max(120).optional().nullable(),
        email: z.string().email().optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        recordTypes: z.array(z.string().min(2)).max(20).default([]),
        responseFormat: z.string().max(40).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      ...(data.id ? { id: data.id } : {}),
      agency_name: data.agencyName,
      department: data.department ?? null,
      county_name: data.countyName ?? null,
      state: data.state.toUpperCase(),
      contact_name: data.contactName ?? null,
      contact_title: data.contactTitle ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      record_types: data.recordTypes,
      response_format: data.responseFormat ?? null,
      notes: data.notes ?? null,
    };
    const { data: saved, error } = await supabaseAdmin
      .from("agency_contacts")
      .upsert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (saved as { id: string }).id };
  });

/** Compose the statute-citing request and put it on the cadence. */
export const scheduleRecordsRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        agencyId: z.string().uuid(),
        recordTypes: z.array(z.string().min(2)).max(20).optional(),
        cadence: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).optional(),
        dateRangeDays: z.number().int().min(7).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { composeAndSchedule } = await import("./records-requests.server");
    const request = await composeAndSchedule(data.agencyId, {
      recordTypes: data.recordTypes,
      cadence: data.cadence,
      dateRangeDays: data.dateRangeDays,
      // Explicit admin action: start the cycle now.
      resetSchedule: true,
    });
    return { request };
  });

/** Manual "send now" — still one request per agency per cycle. */
export const sendRecordsRequestsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { sendDueRequests } = await import("./records-requests.server");
    return sendDueRequests();
  });

/** One-time manual column mapping, remembered for the agency from then on. */
export const saveAgencyColumnMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        agencyId: z.string().uuid(),
        recordType: z.string().min(2).nullable().optional(),
        columnMap: z.record(z.string(), z.string()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { saveAgencyMapping } = await import("./records-requests.server");
    return saveAgencyMapping({
      agencyId: data.agencyId,
      recordType: data.recordType ?? null,
      columnMap: data.columnMap,
      userId: context.userId,
    });
  });

// ── Surplus counties covered by request rather than crawl ──────────────────

/**
 * The counties whose surplus lists cannot be read by crawl (no machine-readable
 * list, or the site forbids collection). Each needs a records custodian address
 * before a request can go out, so the queue reports which ones still lack one.
 */
export const listRequestPathSurplus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: sources }, { data: agencies }, { data: requests }] = await Promise.all([
      supabaseAdmin
        .from("surplus_sources")
        .select("id, county_name, state, sale_kind, refresh_cadence, status, notes, last_checked_at")
        .eq("handler", "records_request")
        .order("state")
        .order("county_name"),
      supabaseAdmin.from("agency_contacts").select("id, county_name, state, email, agency_name, responsive"),
      supabaseAdmin.from("records_requests").select("agency_id, status, cadence, next_send_at, last_sent_at"),
    ]);
    const key = (county: string | null, state: string | null) =>
      `${(county ?? "").toLowerCase()}|${(state ?? "").toUpperCase()}`;
    const byCounty = new Map((agencies ?? []).map((a) => [key(a.county_name, a.state), a]));
    const reqByAgency = new Map((requests ?? []).map((r) => [r.agency_id, r]));
    return {
      counties: (sources ?? []).map((s) => {
        const agency = byCounty.get(key(s.county_name, s.state)) ?? null;
        const request = agency ? (reqByAgency.get(agency.id) ?? null) : null;
        return {
          id: s.id,
          countyName: s.county_name,
          state: s.state,
          saleKind: s.sale_kind,
          cadence: s.refresh_cadence,
          notes: s.notes,
          lastCheckedAt: s.last_checked_at,
          contactEmail: agency?.email ?? null,
          agencyName: agency?.agency_name ?? null,
          responsive: agency?.responsive ?? null,
          requestStatus: request?.status ?? null,
          nextSendAt: request?.next_send_at ?? null,
          lastSentAt: request?.last_sent_at ?? null,
        };
      }),
    };
  });

/** Record a custodian address for a request-path county and put it on cadence. */
export const setSurplusCustodian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        countyName: z.string().min(2).max(120),
        state: z.string().length(2),
        email: z.string().email(),
        agencyName: z.string().min(2).max(200).optional(),
        cadence: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = data.state.toUpperCase();
    const { data: existing } = await supabaseAdmin
      .from("agency_contacts")
      .select("id, record_types")
      .eq("state", state)
      .ilike("county_name", data.countyName)
      .limit(1)
      .maybeSingle();

    let agencyId: string;
    if (existing?.id) {
      const recordTypes = Array.from(new Set([...(existing.record_types ?? []), "surplus_funds"]));
      const { error } = await supabaseAdmin
        .from("agency_contacts")
        .update({ email: data.email, record_types: recordTypes })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      agencyId = existing.id as string;
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("agency_contacts")
        .insert({
          agency_name: data.agencyName ?? `${data.countyName} County Clerk of Court`,
          department: "Public Records",
          county_name: data.countyName,
          state,
          email: data.email,
          record_types: ["surplus_funds"],
          // Unproven until a reply arrives; the sweep still schedules the first ask.
          responsive: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      agencyId = (created as { id: string }).id;
    }

    const { composeAndSchedule } = await import("./records-requests.server");
    await composeAndSchedule(agencyId, {
      recordTypes: ["surplus_funds"],
      cadence: data.cadence ?? "monthly",
      resetSchedule: true,
    });
    return { agencyId };
  });

/** Re-run the request-path sweep so newly contactable counties get scheduled. */
export const sweepRequestPathSurplus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { sweepRecordsRequestSurplusSources } = await import("./surplus/records-request-intake.server");
    return sweepRecordsRequestSurplusSources();
  });
