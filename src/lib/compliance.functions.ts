import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jobLabel, type JobRef } from "@/lib/compliance.shared";

/** Digits-only form used for partial phone matching. */
function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

/** All plausible stored spellings of a US phone, for exact-match lookups. */
function phoneVariants(phone: string): string[] {
  const d = digitsOnly(phone);
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  const set = new Set<string>([phone, d, ten, `1${ten}`, `+1${ten}`]);
  if (ten.length === 10) {
    set.add(`(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`);
    set.add(`${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`);
  }
  return [...set].filter(Boolean);
}

/** Canonical +1XXXXXXXXXX when possible, otherwise the raw input. */
function normalizePhone(v: string): string {
  const d = digitsOnly(v);
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `+1${ten}` : v.trim();
}

const REASON_BUCKETS = {
  opt_out: ["optout", "opt_out", "opt-out", "stop"],
  dnc: ["dnc", "litigator", "not_scrubbed"],
} as const;

export function reasonBucket(reason: string | null | undefined): "opt_out" | "dnc" | "manual" {
  const r = (reason ?? "").toLowerCase();
  if (REASON_BUCKETS.opt_out.some((k) => r.includes(k))) return "opt_out";
  if (REASON_BUCKETS.dnc.some((k) => r.includes(k))) return "dnc";
  return "manual";
}

/** Real compliance inputs for a workspace: registration stage, scrub history, suppression. */
export const getComplianceState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { fetchAllPages } = await import("./pg-page.server");
    const [reg, runs, suppression] = await Promise.all([
      supabase
        .from("registrations")
        .select("brand_status, campaign_status, updated_at")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle(),
      supabase
        .from("scrub_runs")
        .select(
          "id, created_at, provider, total, clean_count, dnc_count, litigator_count, proof, job_id, jobs(name, source_type, params)",
        )
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(200),
      // One select is capped at 1000 rows, which undercounted every suppression
      // list bigger than that — page through the whole list.
      fetchAllPages((from, to) =>
        supabase
          .from("suppression")
          .select("reason")
          .eq("workspace_id", data.workspaceId)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
    ]);

    const counts = { opt_out: 0, dnc: 0, manual: 0 };
    for (const s of suppression) counts[reasonBucket(s.reason)]++;

    const runRows = (runs.data ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      provider: r.provider ?? "DNCScrub",
      total: r.total ?? 0,
      clean_count: r.clean_count ?? 0,
      dnc_count: r.dnc_count ?? 0,
      litigator_count: r.litigator_count ?? 0,
      job_name: jobLabel(r as { jobs?: JobRef | null }),
      proof_ref:
        (r.proof && typeof r.proof === "object" && "reference_id" in r.proof
          ? String((r.proof as Record<string, unknown>).reference_id)
          : r.id.slice(0, 8).toUpperCase()),
    }));

    return {
      registration: {
        brand_status: reg.data?.brand_status ?? null,
        campaign_status: reg.data?.campaign_status ?? null,
        updated_at: reg.data?.updated_at ?? null,
      },
      runs: runRows,
      suppression: { total: suppression.length, ...counts },
      lastScrubAt: runRows[0]?.created_at ?? null,
    };
  });

/** Suppression import: manual entry or CSV upload of existing opt-outs (spec §21). */
export const importSuppression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        phones: z.array(z.string()).min(1).max(20000),
        reason: z.string().max(60).default("manual"),
        source: z.string().max(40).default("compliance"),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Suppression is a compliance control surface — Admin/Owner only.
    {
      const { memberContext } = await import("./accountability.server");
      const { can, denialMessage } = await import("./team-roles.shared");
      const ctx = await memberContext(context.supabase, data.workspaceId, context.userId);
      if (!can(ctx.role, "edit_suppression")) {
        throw new Error(denialMessage(ctx.role, "edit_suppression"));
      }
    }
    const normalized = Array.from(
      new Set(
        data.phones
          .map((p) => p.replace(/[^\d]/g, ""))
          .map((d) => (d.length === 11 && d.startsWith("1") ? d.slice(1) : d))
          .filter((d) => d.length === 10)
          .map((d) => `+1${d}`),
      ),
    );
    if (normalized.length === 0) return { imported: 0, skipped: data.phones.length };

    const { error } = await context.supabase.from("suppression").upsert(
      normalized.map((phone) => ({
        workspace_id: data.workspaceId,
        phone,
        reason: data.reason || "manual",
        source: data.source ?? "compliance",
        note: data.note ?? null,
      })),
      { onConflict: "workspace_id,phone", ignoreDuplicates: true },
    );
    if (error) throw error;
    const { logActivity } = await import("./activity.server");
    await logActivity(context.supabase, data.workspaceId, {
      type: "compliance_digest",
      summary: `${normalized.length.toLocaleString()} Numbers Added To Suppression`,
      detail: data.note ?? data.reason,
      refType: "compliance",
      actorId: context.userId,
    });
    return { imported: normalized.length, skipped: data.phones.length - normalized.length };
  });

/**
 * Searchable suppression list. Partial phone search matches on digits, so
 * "5551234" finds "+15555551234" regardless of how it was stored.
 */
export const listSuppression = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string().default(""),
        reason: z.string().default("all"),
        page: z.number().int().default(0),
        pageSize: z.number().int().default(25),
        all: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { fetchAllPages } = await import("./pg-page.server");
    const rows = await fetchAllPages((from, to) =>
      context.supabase
        .from("suppression")
        .select("phone, reason, note, source, created_at")
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .range(from, to),
      20_000,
    );

    const q = digitsOnly(data.query);
    const textQ = data.query.trim().toLowerCase();
    const filtered = (rows ?? [])
      .map((r) => ({
        phone: r.phone,
        reason: r.reason ?? "manual",
        bucket: reasonBucket(r.reason),
        note: (r as { note?: string | null }).note ?? null,
        source: (r as { source?: string | null }).source ?? "unknown",
        created_at: r.created_at,
      }))
      .filter((r) => (data.reason === "all" ? true : r.bucket === data.reason))
      .filter((r) => {
        if (!textQ) return true;
        if (q) return digitsOnly(r.phone).includes(q);
        return (r.note ?? "").toLowerCase().includes(textQ) || r.source.toLowerCase().includes(textQ);
      });

    const size = Math.min(Math.max(data.pageSize, 5), 200);
    const start = data.all ? 0 : data.page * size;
    return {
      total: filtered.length,
      page: data.page,
      pageSize: size,
      rows: data.all ? filtered : filtered.slice(start, start + size),
    };
  });

/** Blocked-attempt log: every refused send, filterable by path and date range. */
export const listBlockedAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        path: z.string().default("all"),
        days: z.number().int().default(0),
        query: z.string().default(""),
        limit: z.number().int().default(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("compliance_events")
      .select("id, phone, lead_id, path, reason, detail, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(data.limit, 1), 5000));
    if (data.path !== "all") q = q.eq("path", data.path);
    if (data.days > 0) {
      q = q.gte("created_at", new Date(Date.now() - data.days * 86_400_000).toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    const digits = digitsOnly(data.query);
    return {
      rows: (rows ?? [])
        .filter((r) => !digits || digitsOnly(r.phone ?? "").includes(digits))
        .map((r) => ({
          id: r.id,
          phone: r.phone,
          lead_id: r.lead_id,
          path: r.path,
          reason: r.reason,
          source:
            r.detail && typeof r.detail === "object" && "source" in r.detail
              ? String((r.detail as Record<string, unknown>)["source"])
              : "unknown",
          created_at: r.created_at,
        })),
    };
  });

/**
 * Per-person evidentiary view: suppression status, every message to/from the
 * number (with bot/human attribution), and every refused send attempt.
 */
export const lookupContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), phone: z.string().min(4) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const canonical = normalizePhone(data.phone);
    const variants = phoneVariants(data.phone);

    const [supRes, leadRes, blockRes] = await Promise.all([
      supabase
        .from("suppression")
        .select("phone, reason, note, source, created_at")
        .eq("workspace_id", data.workspaceId)
        .in("phone", variants)
        .order("created_at", { ascending: true })
        .limit(5),
      supabase
        .from("leads")
        .select("id, full_name, business_name, phone, city, state")
        .eq("workspace_id", data.workspaceId)
        .in("phone", variants)
        .limit(50),
      supabase
        .from("compliance_events")
        .select("id, phone, path, reason, detail, created_at, lead_id")
        .eq("workspace_id", data.workspaceId)
        .in("phone", variants)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const leads = leadRes.data ?? [];
    const leadIds = leads.map((l) => l.id);

    let messages: Array<{
      id: string;
      direction: string;
      body: string | null;
      status: string | null;
      is_bot: boolean;
      is_optout: boolean;
      error_code: string | null;
      campaign_id: string | null;
      created_at: string;
    }> = [];
    if (leadIds.length > 0) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, direction, body, status, is_bot, is_optout, error_code, campaign_id, created_at")
        .eq("workspace_id", data.workspaceId)
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(1000);
      messages = (msgs ?? []).map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        is_bot: !!m.is_bot,
        is_optout: !!m.is_optout,
        error_code: m.error_code,
        campaign_id: m.campaign_id,
        created_at: m.created_at,
      }));
    }

    const sup = (supRes.data ?? [])[0] ?? null;
    const lead = leads[0] ?? null;

    return {
      phone: canonical,
      found: !!sup || leads.length > 0 || (blockRes.data ?? []).length > 0,
      suppression: sup
        ? {
            phone: sup.phone,
            reason: sup.reason ?? "manual",
            bucket: reasonBucket(sup.reason),
            note: (sup as { note?: string | null }).note ?? null,
            source: (sup as { source?: string | null }).source ?? "unknown",
            created_at: sup.created_at,
          }
        : null,
      lead: lead
        ? {
            id: lead.id,
            name: lead.full_name ?? lead.business_name ?? null,
            city: lead.city,
            state: lead.state,
          }
        : null,
      messages,
      blocks: (blockRes.data ?? []).map((b) => ({
        id: b.id,
        path: b.path,
        reason: b.reason,
        created_at: b.created_at,
        source:
          b.detail && typeof b.detail === "object" && "source" in b.detail
            ? String((b.detail as Record<string, unknown>)["source"])
            : "unknown",
      })),
    };
  });

/** Workspace negative keywords — inbound words that halt a sequence outright. */
export const getNegativeKeywords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspaces")
      .select("negative_keywords")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (error) throw error;
    const { DEFAULT_NEGATIVE_KEYWORDS } = await import("@/lib/negative-keywords");
    const stored = (row as { negative_keywords: string[] | null } | null)?.negative_keywords;
    return { keywords: stored?.length ? stored : DEFAULT_NEGATIVE_KEYWORDS };
  });

export const setNegativeKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      keywords: z.array(z.string().trim().min(2).max(40)).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const cleaned = Array.from(
      new Set(data.keywords.map((k) => k.toLowerCase()).filter(Boolean)),
    );
    const { error } = await context.supabase
      .from("workspaces")
      .update({ negative_keywords: cleaned } as never)
      .eq("id", data.workspaceId);
    if (error) throw error;
    return { keywords: cleaned };
  });
