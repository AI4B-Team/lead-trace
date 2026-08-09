import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatJobName } from "@/lib/job-naming";

// Recurring-scan monitoring layer (spec §15.1) + the cumulative Leads asset
// (spec §14). Everything here reports what the system actually did — no
// predictive scoring, no fabricated signal feeds.

const CADENCES = ["one_time", "12h", "daily", "weekly"] as const;

// The cumulative, cross-list record asset.
export const listLeadRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        disposition: z.enum(["all", "clean", "dnc", "litigator"]).default("all"),
        sourceType: z.string().max(40).default("all"),
        lineType: z.enum(["all", "mobile", "landline", "voip", "unknown"]).default("all"),
        channel: z.enum(["all", "phone", "email", "address"]).default("all"),
        onlyNew: z.boolean().default(false),
        multiList: z.boolean().default(false),
        onlyNominated: z.boolean().default(false),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let q = supabase
      .from("lead_records")
      .select(
        "id, full_name, business_name, phone, phone_type, email, address, website, socials, handle, platform, followers, engagement, city, state, zip, disposition, source_types, record_types, list_count, first_seen_at, last_seen_at, is_new, nominated_at, nominated_score, nominated_reason",
      )
      .eq("workspace_id", data.workspaceId)
      .order("last_seen_at", { ascending: false })
      .limit(data.limit);

    if (data.disposition !== "all") q = q.eq("disposition", data.disposition);
    if (data.lineType !== "all") q = q.eq("phone_type", data.lineType);
    if (data.channel === "phone") q = q.not("phone", "is", null);
    if (data.channel === "email") q = q.not("email", "is", null);
    if (data.channel === "address") q = q.not("address", "is", null);
    if (data.sourceType !== "all") q = q.contains("source_types", [data.sourceType]);
    if (data.onlyNew) q = q.eq("is_new", true);
    if (data.multiList) q = q.gt("list_count", 1);
    // "Shortlist" = records a person accepted from a Lead Scout nomination.
    if (data.onlyNominated) q = q.not("nominated_at", "is", null);
    if (data.search?.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(
        `full_name.ilike.${s},business_name.ilike.${s},phone.ilike.${s},email.ilike.${s},city.ilike.${s},state.ilike.${s}`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    // Lead tags are per-contact labels applied anywhere (inbox, leads page).
    // lead_records roll up by phone, so we map tags through the raw leads rows.
    const phones = (rows ?? []).map((r) => r.phone).filter((p): p is string => !!p);
    const tagsByPhone = new Map<string, Array<{ id: string; name: string; color: string }>>();
    if (phones.length) {
      const { data: tagRows } = await supabase
        .from("lead_tags")
        .select("tags(id, name, color), leads!inner(phone)")
        .eq("workspace_id", data.workspaceId)
        .in("leads.phone", phones);
      for (const row of (tagRows ?? []) as unknown as Array<{
        tags: { id: string; name: string; color: string } | null;
        leads: { phone: string | null } | null;
      }>) {
        const phone = row.leads?.phone;
        if (!phone || !row.tags) continue;
        const list = tagsByPhone.get(phone) ?? [];
        if (!list.some((t) => t.id === row.tags!.id)) list.push(row.tags);
        tagsByPhone.set(phone, list);
      }
    }
    const rowsWithTags = (rows ?? []).map((r) => ({
      ...r,
      tags: r.phone ? tagsByPhone.get(r.phone) ?? [] : [],
    }));

    // Header stat cards — counts, not charts.
    function baseCount() {
      return supabase
        .from("lead_records")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId);
    }

    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [total, clean, dnc, litigator, thisWeek, multi, smsEligible, emailReachable, mailable] = await Promise.all([
      baseCount(),
      baseCount().eq("disposition", "clean"),
      baseCount().eq("disposition", "dnc"),
      baseCount().eq("disposition", "litigator"),
      baseCount().gte("first_seen_at", weekAgo),
      baseCount().gt("list_count", 1),
      baseCount().eq("disposition", "clean").eq("phone_type", "mobile"),
      baseCount().neq("disposition", "litigator").not("email", "is", null),
      baseCount().not("address", "is", null),
    ]);

    const { data: sourceRows } = await supabase
      .from("lead_records")
      .select("source_types, record_types")
      .eq("workspace_id", data.workspaceId)
      .limit(5000);

    const bySource: Record<string, number> = {};
    const byRecordType: Record<string, number> = {};
    for (const r of sourceRows ?? []) {
      for (const s of r.source_types ?? []) bySource[s] = (bySource[s] ?? 0) + 1;
      for (const t of r.record_types ?? []) byRecordType[t] = (byRecordType[t] ?? 0) + 1;
    }

    return {
      rows: rowsWithTags,
      stats: {
        total: total.count ?? 0,
        clean: clean.count ?? 0,
        dnc: dnc.count ?? 0,
        litigator: litigator.count ?? 0,
        newThisWeek: thisWeek.count ?? 0,
        multiList: multi.count ?? 0,
        smsEligible: smsEligible.count ?? 0,
        emailReachable: emailReachable.count ?? 0,
        mailable: mailable.count ?? 0,
      },
      bySource,
      byRecordType,
    };
  });

// Which lists (runs) a single de-duplicated lead appears in. Membership is
// derived from the raw `leads` rows that rolled up into this record.
export const getLeadListMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), leadRecordId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: record } = await supabase
      .from("lead_records")
      .select("phone, business_name, full_name, first_seen_job_id, last_seen_job_id")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.leadRecordId)
      .maybeSingle();
    type ListRef = { id: string; listId: string; name: string; created_at: string };
    const empty = { lists: [] as ListRef[] };
    if (!record) return empty;

    let rawQ = supabase
      .from("leads")
      .select("job_id")
      .eq("workspace_id", data.workspaceId)
      .limit(500);
    if (record.phone) rawQ = rawQ.eq("phone", record.phone);
    else if (record.business_name) rawQ = rawQ.eq("business_name", record.business_name);
    else if (record.full_name) rawQ = rawQ.eq("full_name", record.full_name);
    const { data: raw } = await rawQ;

    const jobIds = new Set<string>();
    for (const r of raw ?? []) if (r.job_id) jobIds.add(r.job_id);
    if (record.first_seen_job_id) jobIds.add(record.first_seen_job_id);
    if (record.last_seen_job_id) jobIds.add(record.last_seen_job_id);
    if (jobIds.size === 0) return empty;

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, name, source_type, record_type, params, schedule, created_at, parent_job_id")
      .eq("workspace_id", data.workspaceId)
      .in("id", [...jobIds]);

    const lists = (jobs ?? [])
      .map((j) => ({
        id: j.id,
        listId: j.parent_job_id ?? j.id,
        name: j.name ?? formatJobName(j as never, 1),
        created_at: j.created_at,
      }))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

    return { lists };
  });

// "Since your last visit" digest — only counts things that really happened.
export const getScanDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("workspace_members")
      .select("last_visit_at")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    const since = member?.last_visit_at ?? new Date(Date.now() - 7 * 86_400_000).toISOString();

    const { count: newRecords } = await supabase
      .from("lead_records")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .gte("first_seen_at", since);

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, params, source_type, record_type, schedule, next_run_at, last_run_at, parent_job_id, created_at, status")
      .eq("workspace_id", data.workspaceId)
      .neq("schedule", "one_time")
      .order("created_at", { ascending: false });

    const recurring = [] as Array<{
      id: string;
      name: string;
      schedule: string;
      record_type: string;
      next_run_at: string | null;
      last_run_at: string | null;
      newRecords: number;
      due: boolean;
    }>;

    for (const j of jobs ?? []) {
      const params = (j.params ?? {}) as { name?: string; file_name?: string };
      const { count } = await supabase
        .from("lead_records")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("last_seen_job_id", j.id)
        .gte("first_seen_at", since);
      recurring.push({
        id: j.id,
        name: params.name ?? params.file_name ?? `${j.source_type} · ${j.id.slice(0, 8)}`,
        schedule: j.schedule ?? "one_time",
        record_type: j.record_type ?? "business",
        next_run_at: j.next_run_at,
        last_run_at: j.last_run_at,
        newRecords: count ?? 0,
        due: !!j.next_run_at && new Date(j.next_run_at) <= new Date(),
      });
    }

    const { data: typeRows } = await supabase
      .from("lead_records")
      .select("record_types")
      .eq("workspace_id", data.workspaceId)
      .gte("first_seen_at", since)
      .limit(5000);
    const byRecordType: Record<string, number> = {};
    for (const r of typeRows ?? []) {
      for (const t of r.record_types ?? []) byRecordType[t] = (byRecordType[t] ?? 0) + 1;
    }

    return { since, newRecords: newRecords ?? 0, recurring, byRecordType };
  });

// Stamp the visit so the next digest window starts here.
export const markWorkspaceVisited = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("workspace_members")
      .update({ last_visit_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const setJobSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ jobId: z.string().uuid(), schedule: z.enum(CADENCES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { nextRunFor } = await import("./monitoring.shared");
    const next = data.schedule === "one_time" ? null : nextRunFor(data.schedule, new Date());
    const { error } = await context.supabase
      .from("jobs")
      .update({ schedule: data.schedule, next_run_at: next })
      .eq("id", data.jobId);
    if (error) throw error;
    return { ok: true, next_run_at: next };
  });

// Queue a fresh run for every recurring job that is due. Returns the new job
// ids so the caller can advance them through the normal pipeline.
export const queueDueScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { nextRunFor } = await import("./monitoring.shared");
    const now = new Date();

    const { data: due } = await supabase
      .from("jobs")
      .select("id, source_type, record_type, params, schedule, workspace_id")
      .eq("workspace_id", data.workspaceId)
      .neq("schedule", "one_time")
      .lte("next_run_at", now.toISOString());

    const queued: string[] = [];
    for (const j of due ?? []) {
      const { data: clone } = await supabase
        .from("jobs")
        .insert({
          workspace_id: j.workspace_id,
          source_type: j.source_type,
          record_type: j.record_type ?? "business",
          params: j.params as never,
          status: "queued",
          schedule: "one_time",
          parent_job_id: j.id,
          created_by: userId,
        })
        .select("id")
        .maybeSingle();
      if (clone?.id) queued.push(clone.id);
      await supabase
        .from("jobs")
        .update({
          last_run_at: now.toISOString(),
          next_run_at: nextRunFor(j.schedule as "12h" | "daily" | "weekly", now),
        })
        .eq("id", j.id);
    }

    return { queued };
  });

// Webhook endpoints — the hub subscribes here (spec §15.2).
export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("webhook_endpoints")
      .select("id, url, event_types, active, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { rows: rows ?? [] };
  });

export const saveWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        url: z.string().url(),
        eventTypes: z.array(z.string().max(60)).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("webhook_endpoints").insert({
      workspace_id: data.workspaceId,
      url: data.url,
      event_types: data.eventTypes,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("webhook_endpoints").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Export the Leads library exactly as it is filtered on screen. Rows come back
 * flat and already labelled, so the download matches the table the operator is
 * looking at. RLS scopes it to the workspace; the caller still routes the file
 * through guardedExport so it is attributed, capped and watermarked.
 */
export const exportLeadRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        disposition: z.enum(["all", "clean", "dnc", "litigator"]).default("all"),
        sourceType: z.string().max(40).default("all"),
        lineType: z.enum(["all", "mobile", "landline", "voip", "unknown"]).default("all"),
        channel: z.enum(["all", "phone", "email", "address"]).default("all"),
        onlyNew: z.boolean().default(false),
        multiList: z.boolean().default(false),
        onlyNominated: z.boolean().default(false),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(25_000).default(25_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("lead_records")
      .select(
        "full_name, business_name, phone, phone_type, email, address, city, state, zip, website, handle, platform, followers, engagement, disposition, source_types, record_types, list_count, first_seen_at, last_seen_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("last_seen_at", { ascending: false })
      .limit(data.limit);

    if (data.disposition !== "all") q = q.eq("disposition", data.disposition);
    if (data.lineType !== "all") q = q.eq("phone_type", data.lineType);
    if (data.channel === "phone") q = q.not("phone", "is", null);
    if (data.channel === "email") q = q.not("email", "is", null);
    if (data.channel === "address") q = q.not("address", "is", null);
    if (data.sourceType !== "all") q = q.contains("source_types", [data.sourceType]);
    if (data.onlyNew) q = q.eq("is_new", true);
    if (data.multiList) q = q.gt("list_count", 1);
    if (data.onlyNominated) q = q.not("nominated_at", "is", null);
    if (data.search?.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(
        `full_name.ilike.${s},business_name.ilike.${s},phone.ilike.${s},email.ilike.${s},city.ilike.${s},state.ilike.${s}`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    const out = (rows ?? []).map((r) => ({
      full_name: r.full_name ?? "",
      business_name: r.business_name ?? "",
      phone: r.phone ?? "",
      phone_type: r.phone_type ?? "",
      email: r.email ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      zip: r.zip ?? "",
      website: r.website ?? "",
      handle: r.handle ?? "",
      platform: r.platform ?? "",
      followers: r.followers ?? "",
      engagement: r.engagement ?? "",
      disposition: r.disposition ?? "",
      sources: (r.source_types ?? []).join(" | "),
      record_types: (r.record_types ?? []).join(" | "),
      lists: r.list_count ?? 1,
      first_seen: r.first_seen_at ?? "",
      last_seen: r.last_seen_at ?? "",
    }));
    return { rows: out };
  });
