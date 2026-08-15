// ---------------------------------------------------------------------------
// Public Records Request engine (server-only).
//
// Throttling invariant: ONE request per agency per cycle, sent by LeadTrace —
// never one per user. Hundreds of duplicate automated requests would get our
// domain ignored by the very records officers this depends on. The dataset an
// agency returns is distributed to every workspace subscribed to that county.
// ---------------------------------------------------------------------------

import {
  CADENCE_DAYS,
  composeRequestBody,
  composeRequestSubject,
  type RequestCadence,
} from "./records-requests.shared";
import { csvToRecords } from "./data-providers/bulk-file";
import { inferFieldMap, isUsableMap, normalizeRows, type FieldMap } from "./data-providers/source-mapping";

const REQUEST_FROM = "records@leadtrace.com";

type AgencyRow = {
  id: string;
  agency_name: string;
  department: string | null;
  county_name: string | null;
  state: string;
  contact_name: string | null;
  email: string | null;
  record_types: string[];
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function nextSendAt(cadence: RequestCadence, from = new Date()): string {
  return new Date(from.getTime() + CADENCE_DAYS[cadence] * 86_400_000).toISOString();
}

/**
 * A clerk address that hard-bounces (or files a complaint) is a wrong address,
 * not a delivery hiccup: keep mailing it and the domain's reputation pays for
 * it. Park the request and drop the address so the county reappears as
 * "awaiting contact" in the admin queue for a human to correct.
 *
 * Notification/bookkeeping only — Lovable already blocks the send itself.
 * Safe to run more than once for the same event.
 */
export async function handleUndeliverableRecipient(recipient: string, reason: "bounced" | "complaint") {
  const db = await admin();
  const email = recipient.trim().toLowerCase();
  const { data: agencies } = await db
    .from("agency_contacts")
    .select("id, email")
    .ilike("email", email)
    .limit(10);
  const ids = ((agencies ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (ids.length === 0) return { matched: 0 };

  const note =
    reason === "complaint"
      ? `Marked As Spam By ${email} — Address Cleared`
      : `Mail To ${email} Bounced — Address Cleared`;
  await db.from("records_requests").update({ status: "failed", last_error: note }).in("agency_id", ids);
  await db.from("agency_contacts").update({ email: null, notes: note }).in("id", ids);
  return { matched: ids.length };
}

/**
 * Compose (or recompose) the request body for an agency and schedule it.
 *
 * Throttle invariant: composing must NEVER pull a send forward. The nightly
 * sweep calls this for every request-path county, so overwriting `next_send_at`
 * with "now" would re-mail an already-sent clerk every single night. An existing
 * row therefore keeps its own schedule and lifecycle status unless the caller
 * explicitly asks to (re)start the cycle.
 */
export async function composeAndSchedule(agencyId: string, opts: {
  recordTypes?: string[];
  cadence?: RequestCadence;
  dateRangeDays?: number;
  /** Start the cycle now (first-ever request, or a human-triggered resend). */
  resetSchedule?: boolean;
} = {}) {
  const db = await admin();
  const { data: agency, error } = await db
    .from("agency_contacts")
    .select("id, agency_name, department, county_name, state, contact_name, email, record_types")
    .eq("id", agencyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!agency) throw new Error("Agency Not Found");
  const a = agency as unknown as AgencyRow;

  const { data: existingRow } = await db
    .from("records_requests")
    .select("id, status, next_send_at")
    .eq("agency_id", a.id)
    .maybeSingle();
  const existing = existingRow as { status?: string; next_send_at?: string | null } | null;

  const recordTypes = opts.recordTypes?.length ? opts.recordTypes : a.record_types;
  const cadence = opts.cadence ?? "monthly";
  const dateRangeDays = opts.dateRangeDays ?? CADENCE_DAYS[cadence];
  const composeArgs = {
    agencyName: a.agency_name,
    department: a.department,
    contactName: a.contact_name,
    state: a.state,
    recordTypes,
    dateRangeDays,
    requesterEmail: REQUEST_FROM,
  };

  const row = {
    agency_id: a.id,
    record_types: recordTypes,
    cadence,
    date_range_days: dateRangeDays,
    subject: composeRequestSubject(composeArgs),
    body: composeRequestBody(composeArgs),
    status: existing && !opts.resetSchedule ? (existing.status ?? "scheduled") : "scheduled",
    next_send_at:
      existing && !opts.resetSchedule
        ? (existing.next_send_at ?? new Date().toISOString())
        : new Date().toISOString(),
  };
  const { data, error: upErr } = await db
    .from("records_requests")
    .upsert(row, { onConflict: "agency_id" })
    .select("id, subject, body, next_send_at")
    .single();
  if (upErr) throw new Error(upErr.message);
  return data;
}

/**
 * Managed email transport. Delivery, retries, suppression and rate limits are
 * handled upstream; a suppressed recipient is a normal, non-error outcome.
 */
type SendOutcome = {
  sent: boolean;
  error?: string;
  /** Recipient is blocked upstream — the address itself is the problem. */
  suppressed?: boolean;
  /** Seconds to wait before this send should be attempted again. */
  retryAfterSeconds?: number;
};

async function sendEmail(to: string, subject: string, body: string): Promise<SendOutcome> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { sent: false, error: "Email Sending Is Not Configured Yet" };
  try {
    const { sendLovableEmail } = await import("@lovable.dev/email-js");
    const html = `<pre style="font-family:inherit;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`;
    const result = await sendLovableEmail(
      { to, from: REQUEST_FROM, subject, text: body, html, purpose: "records_request", label: "records-request" },
      { apiKey },
    );
    if (!result.success) {
      const reason = String((result as { reason?: string }).reason ?? result.status ?? "Unknown Reason");
      if (reason === "recipient_suppressed") {
        return { sent: false, suppressed: true, error: "Address Blocked After Earlier Bounce Or Complaint" };
      }
      return { sent: false, error: `Not Delivered (${reason})` };
    }
    return { sent: true };
  } catch (e) {
    const rate = e as { status?: number; retryAfterSeconds?: number | null };
    if (rate && rate.status === 429) {
      return {
        sent: false,
        retryAfterSeconds: rate.retryAfterSeconds ?? 60,
        error: "Sending Paused Briefly — Hourly Email Allowance Reached",
      };
    }
    return { sent: false, error: e instanceof Error ? e.message : "Email Send Failed" };
  }
}

/**
 * Send every request that is due. One agency, one send per cycle — enforced by
 * `next_send_at` on the single request row each agency is allowed to have.
 */
export async function sendDueRequests(limit = 25) {
  const db = await admin();
  const nowIso = new Date().toISOString();
  const { data } = await db
    .from("records_requests")
    .select("id, agency_id, subject, body, cadence, record_types, date_range_days, next_send_at, status")
    .in("status", ["scheduled", "sent", "received"])
    .lte("next_send_at", nowIso)
    .limit(limit);

  const results: Array<{ id: string; sent: boolean; error?: string }> = [];
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(r.id);
    const { data: agency } = await db
      .from("agency_contacts")
      .select("email, agency_name")
      .eq("id", String(r.agency_id))
      .maybeSingle();
    const email = (agency as { email?: string } | null)?.email;
    if (!email) {
      await db.from("records_requests").update({ status: "failed", last_error: "Agency Has No Email On File" }).eq("id", id);
      results.push({ id, sent: false, error: "No Email" });
      continue;
    }
    // Recompose so the date range always covers the cycle just completed.
    const fresh = await composeAndSchedule(String(r.agency_id), {
      recordTypes: (r.record_types as string[]) ?? [],
      cadence: r.cadence as RequestCadence,
      dateRangeDays: Number(r.date_range_days) || undefined,
    });
    const outcome = await sendEmail(email, String(fresh?.subject ?? r.subject), String(fresh?.body ?? r.body));
    if (outcome.suppressed) {
      // Upstream will never deliver to this address again: return the county to
      // the "awaiting contact" queue instead of retrying forever.
      await handleUndeliverableRecipient(email, "bounced");
      results.push({ id, sent: false, error: outcome.error });
      continue;
    }
    await db
      .from("records_requests")
      .update(
        outcome.sent
          ? {
              status: "sent",
              last_sent_at: nowIso,
              next_send_at: nextSendAt(r.cadence as RequestCadence),
              last_error: null,
            }
          : {
              status: "scheduled",
              last_error: outcome.error ?? null,
              ...(outcome.retryAfterSeconds
                ? { next_send_at: new Date(Date.now() + outcome.retryAfterSeconds * 1000).toISOString() }
                : {}),
            },
      )
      .eq("id", id);
    results.push({ id, ...outcome });
  }
  return { processed: results.length, results };
}

// ── Inbound file handling ──────────────────────────────────────────────────

/**
 * Remembered mapping for an agency, if a human already fixed one. A mapping
 * saved for this specific record type wins over the agency-wide fallback, so
 * order the specific row first instead of taking whichever row comes back.
 */
async function savedMap(agencyId: string, recordType: string | null): Promise<FieldMap | null> {
  const db = await admin();
  let q = db.from("agency_column_maps").select("column_map, record_type").eq("agency_id", agencyId);
  // Record types are human-entered ("Code Violation, Lien"), so quote the value.
  if (recordType) q = q.or(`record_type.eq.${pgFilterValue(recordType)},record_type.is.null`);
  const { data } = await q.order("record_type", { ascending: true, nullsFirst: false }).limit(1);
  const row = (data ?? [])[0] as { column_map?: FieldMap } | undefined;
  return row?.column_map ?? null;
}

export type IngestResult = {
  fileId: string;
  status: "parsed" | "needs_mapping" | "failed";
  rowsTotal: number;
  rowsParsed: number;
  distributedTo: number;
  error?: string;
};

/**
 * Parse a returned CSV/Excel-exported-as-CSV attachment, normalize it, and push
 * it into the standard pipeline for every workspace subscribed to that county.
 * When auto-mapping fails the file is queued for a one-time manual mapping,
 * which is then remembered for that agency permanently.
 */
export async function ingestAgencyFile(args: {
  agencyId: string;
  filename: string;
  text: string;
  recordType?: string | null;
}): Promise<IngestResult> {
  const db = await admin();
  const { data: agency } = await db
    .from("agency_contacts")
    .select("id, agency_name, county_name, state, record_types")
    .eq("id", args.agencyId)
    .maybeSingle();
  if (!agency) throw new Error("Agency Not Found");
  const a = agency as unknown as AgencyRow;
  const { data: req } = await db
    .from("records_requests")
    .select("id, record_types")
    .eq("agency_id", args.agencyId)
    .maybeSingle();
  const recordType =
    args.recordType ?? ((req as { record_types?: string[] } | null)?.record_types ?? a.record_types)[0] ?? "Code Violation";

  const rows = csvToRecords(args.text);
  const columns = Object.keys(rows[0] ?? {});
  const map = (await savedMap(args.agencyId, recordType)) ?? inferFieldMap(columns);

  const fileInsert = {
    request_id: (req as { id?: string } | null)?.id ?? null,
    agency_id: args.agencyId,
    filename: args.filename,
    file_type: args.filename.split(".").pop()?.toLowerCase() ?? null,
    rows_total: rows.length,
    detected_columns: columns,
    sample_rows: rows.slice(0, 5) as never,
  };

  if (rows.length === 0 || !isUsableMap(map)) {
    const why = rows.length === 0 ? "No Readable Rows In File" : "Could Not Auto-Map Columns";
    const { data: file } = await db
      .from("records_request_files")
      .insert({
        ...fileInsert,
        parse_status: "needs_mapping",
        parse_error: why,
        // Kept so a human can fix the mapping and re-ingest without asking the
        // agency to resend the file.
        raw_text: args.text.slice(0, 4_000_000),
      })
      .select("id")
      .single();
    if (req) await db.from("records_requests").update({ status: "needs_mapping" }).eq("id", (req as { id: string }).id);
    return {
      fileId: String((file as { id?: string } | null)?.id ?? ""),
      status: "needs_mapping",
      rowsTotal: rows.length,
      rowsParsed: 0,
      distributedTo: 0,
      error: "Queued For One-Time Column Mapping",
    };
  }

  const county = a.county_name ? `${a.county_name}, ${a.state}` : a.state;
  const leads = normalizeRows(rows, map, {
    recordType,
    county,
    state: a.state,
    provider: `${a.agency_name} (Public Records Request)`,
    casePrefix: "PRR",
  });

  const distributedTo = await distributeToSubscribers({ county, recordType, leads, agencyName: a.agency_name });

  const { data: file } = await db
    .from("records_request_files")
    .insert({ ...fileInsert, parse_status: "parsed", rows_parsed: leads.length })
    .select("id")
    .single();
  if (req)
    await db
      .from("records_requests")
      .update({ status: "received", last_received_at: new Date().toISOString(), last_error: null })
      .eq("id", (req as { id: string }).id);

  return {
    fileId: String((file as { id?: string } | null)?.id ?? ""),
    status: "parsed",
    rowsTotal: rows.length,
    rowsParsed: leads.length,
    distributedTo,
  };
}

type LeadShape = {
  full_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  source_meta?: Record<string, unknown>;
};

/**
 * Every workspace that has ever asked for this county's records gets a copy —
 * one agency request, many beneficiaries.
 */
async function distributeToSubscribers(args: {
  county: string;
  recordType: string;
  leads: LeadShape[];
  agencyName: string;
}): Promise<number> {
  if (args.leads.length === 0) return 0;
  const db = await admin();
  const countyName = args.county.split(",")[0]!.trim();
  const { data: jobs } = await db
    .from("jobs")
    .select("workspace_id, params")
    .eq("source_type", "records")
    .order("created_at", { ascending: false })
    .limit(500);

  const workspaces = new Set<string>();
  for (const j of (jobs ?? []) as Array<{ workspace_id: string; params: Record<string, unknown> }>) {
    const counties = [
      ...(((j.params?.counties as string[]) ?? []) || []),
      String(j.params?.county ?? ""),
    ].filter(Boolean);
    if (counties.some((c) => c.toLowerCase().includes(countyName.toLowerCase()))) workspaces.add(j.workspace_id);
  }
  if (workspaces.size === 0) return 0;

  for (const workspaceId of workspaces) {
    const { data: job } = await db
      .from("jobs")
      .insert({
        workspace_id: workspaceId,
        source_type: "records",
        record_type: args.recordType,
        name: `${args.county} — ${args.recordType} (Records Request)`,
        status: "complete",
        params: { counties: [args.county], record_types: [args.recordType], via: "public_records_request", agency: args.agencyName },
        rows_in: args.leads.length,
        rows_deduped: args.leads.length,
      })
      .select("id")
      .single();
    const jobId = (job as { id?: string } | null)?.id;
    if (!jobId) continue;
    const chunk = 500;
    for (let i = 0; i < args.leads.length; i += chunk) {
      await db.from("leads").insert(
        args.leads.slice(i, i + chunk).map((l) => ({
          workspace_id: workspaceId,
          job_id: jobId,
          full_name: l.full_name ?? null,
          address: l.address ?? null,
          city: l.city ?? null,
          state: l.state ?? null,
          zip: l.zip ?? null,
          source_meta: (l.source_meta ?? {}) as never,
          data_provenance: "verified_source",
        })),
      );
    }
  }
  return workspaces.size;
}

/** Save a human's column mapping for an agency and re-parse the file. */
export async function saveAgencyMapping(args: {
  agencyId: string;
  recordType: string | null;
  columnMap: FieldMap;
  userId?: string | null;
}) {
  const db = await admin();
  const { error } = await db.from("agency_column_maps").upsert(
    {
      agency_id: args.agencyId,
      record_type: args.recordType,
      column_map: args.columnMap,
      created_by: args.userId ?? null,
    },
    { onConflict: "agency_id,record_type" },
  );
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * Fix a file that could not be auto-mapped: remember the human's mapping for
 * the agency, then re-run the original file contents through the same ingest
 * path so the rows land in the pipeline without asking the agency to resend.
 */
export async function remapAndReingestFile(args: {
  fileId: string;
  columnMap: FieldMap;
  userId?: string | null;
}): Promise<IngestResult> {
  const db = await admin();
  const { data: file } = await db
    .from("records_request_files")
    .select("id, agency_id, filename, raw_text, parse_status")
    .eq("id", args.fileId)
    .maybeSingle();
  const f = file as
    | { id: string; agency_id: string; filename: string; raw_text: string | null }
    | null;
  if (!f) throw new Error("File Not Found");
  if (!f.raw_text) throw new Error("Original File Contents Are No Longer Available");
  if (!isUsableMap(args.columnMap)) throw new Error("Mapping Needs At Least An Address Or Owner Column");

  await saveAgencyMapping({
    agencyId: f.agency_id,
    recordType: null,
    columnMap: args.columnMap,
    userId: args.userId ?? null,
  });

  const result = await ingestAgencyFile({
    agencyId: f.agency_id,
    filename: f.filename,
    text: f.raw_text,
  });

  // The superseded row stays for the audit trail, without its bulky payload.
  await db
    .from("records_request_files")
    .update({ parse_status: "remapped", parse_error: null, raw_text: null })
    .eq("id", f.id);

  return result;
}
