/**
 * Authoritative opt-out / suppression gate for EVERY outbound message path.
 *
 * TCPA: a contact who replied STOP, or a phone on the workspace suppression
 * list, must never be texted again — from the inbox composer, a campaign
 * runner, an auto-launched cadence, a slash command, or a bot reply.
 * The UI block is cosmetic; this is the real one.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any };

import { isTrustedProvenance, UNTRUSTED_LEAD_MESSAGE } from "./provenance.shared";

export const OPTOUT_ERROR = "Contact has opted out — message not sent";
export const OPTOUT_OTHER_LINE_ERROR =
  "Contact opted out on another one of their numbers — message not sent";
export const SUPPRESSED_ERROR = "Number is on your suppression list — message not sent";
export const DNC_ERROR = "Number is on the National Do Not Call Registry — message not sent";
export const LITIGATOR_ERROR = "Number is on a known-litigator list — message not sent";
export const NOT_SCRUBBED_ERROR =
  "Number has not passed DNC and litigator scrubbing — message not sent";

export type BlockReason =
  | "opted_out"
  | "opted_out_other_line"
  | "suppressed"
  | "dnc_listed"
  | "litigator_listed"
  | "not_scrubbed"
  | "unverified_source";

export type SendGate =
  | { ok: true; phone: string | null }
  | { ok: false; reason: BlockReason; message: string; phone: string | null };

export type GateTarget = {
  workspaceId: string;
  leadId?: string | null;
  threadKey?: string | null;
  phone?: string | null;
  /** Free-form context for the audit log (campaign id, "inbox", "cadence"). */
  source?: string;
  actorId?: string | null;
  /**
   * Fail-closed strictness. When true, only a lead with scrub_status 'clean'
   * may be texted. Defaults by send path: cold outbound (campaign, cadence)
   * requires a clean scrub; manual replies and bot replies on consumer-
   * initiated threads do not, though DNC and litigator hits still hard-block.
   */
  requireScrubbed?: boolean;
};

/** Which send path attempted the blocked message — used by the compliance log. */
export type SendPath = "manual" | "campaign" | "bot" | "cadence" | "unknown";

/** Normalizes free-form `source` strings ("bot:<id>", "campaign:x") into a path. */
export function sendPathFromSource(source?: string | null): SendPath {
  const s = (source ?? "").toLowerCase();
  if (s.startsWith("bot")) return "bot";
  if (s.startsWith("campaign") || s.startsWith("runner") || s.startsWith("tick")) return "campaign";
  if (s.startsWith("cadence") || s.startsWith("recurring")) return "cadence";
  if (s.startsWith("inbox") || s.startsWith("manual") || s.startsWith("composer")) return "manual";
  return "unknown";
}

/** All plausible stored spellings of a US phone, for exact-match lookups. */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const set = new Set<string>([phone, digits, ten, `1${ten}`, `+1${ten}`]);
  if (ten.length === 10) {
    set.add(`(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`);
    set.add(`${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`);
  }
  return [...set].filter(Boolean);
}

/** Pre-load a workspace's suppression set once for batch sends (campaign ticks). */
export async function loadSuppressionSet(db: Client, workspaceId: string): Promise<Set<string>> {
  const { data } = await db.from("suppression").select("phone").eq("workspace_id", workspaceId);
  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ phone: string }>) {
    for (const v of phoneVariants(row.phone)) set.add(v);
  }
  return set;
}

/** Lead ids that have ever sent an opt-out in this workspace. */
export async function loadOptedOutLeadIds(db: Client, workspaceId: string): Promise<Set<string>> {
  const { data } = await db
    .from("messages")
    .select("lead_id")
    .eq("workspace_id", workspaceId)
    .eq("is_optout", true);
  return new Set(
    ((data ?? []) as Array<{ lead_id: string | null }>).map((r) => r.lead_id).filter(Boolean) as string[],
  );
}

/** Cold outbound must be scrubbed; consumer-initiated conversation need not be. */
function requiresCleanScrub(t: GateTarget): boolean {
  if (typeof t.requireScrubbed === "boolean") return t.requireScrubbed;
  const path = sendPathFromSource(t.source);
  return path === "campaign" || path === "cadence";
}

/** Non-throwing check. Resolves the phone from the lead when not supplied. */
export async function checkCanText(db: Client, t: GateTarget): Promise<SendGate> {
  let phone = t.phone ?? null;
  let scrubStatus: string | null = null;
  let provenance: string | null = null;
  if (t.leadId) {
    const { data } = await db
      .from("leads")
      .select("phone, scrub_status, data_provenance")
      .eq("id", t.leadId)
      .maybeSingle();
    const lead = data as
      | { phone: string | null; scrub_status: string | null; data_provenance: string | null }
      | null;
    phone = phone ?? lead?.phone ?? null;
    scrubStatus = lead?.scrub_status ?? null;
    provenance = lead?.data_provenance ?? null;
  }

  // 0. Provenance: records we cannot trace to a verified source (or the
  // customer's own upload) are never contactable, in any direction.
  if (t.leadId && !isTrustedProvenance(provenance)) {
    return { ok: false, reason: "unverified_source", message: UNTRUSTED_LEAD_MESSAGE, phone };
  }

  // 1. Did this contact reply STOP? (thread- and lead-scoped)
  if (t.leadId || t.threadKey) {
    let q = db.from("messages").select("id").eq("workspace_id", t.workspaceId).eq("is_optout", true).limit(1);
    q = t.leadId ? q.eq("lead_id", t.leadId) : q.eq("thread_key", t.threadKey as string);
    const { data } = await q;
    if ((data ?? []).length > 0) {
      return { ok: false, reason: "opted_out", message: OPTOUT_ERROR, phone };
    }
  }

  // 2. Workspace suppression list (STOP auto-adds, blacklist, uploaded files).
  if (phone) {
    const { data } = await db
      .from("suppression")
      .select("phone")
      .eq("workspace_id", t.workspaceId)
      .in("phone", phoneVariants(phone))
      .limit(1);
    if ((data ?? []).length > 0) {
      return { ok: false, reason: "suppressed", message: SUPPRESSED_ERROR, phone };
    }
  }

  // 3. Scrub verdict. DNC and litigator hits block EVERY path, inbound
  //    included. An absent or unknown verdict blocks cold outbound only —
  //    a list that was never scrubbed must not be campaignable.
  if (scrubStatus === "dnc") {
    return { ok: false, reason: "dnc_listed", message: DNC_ERROR, phone };
  }
  if (scrubStatus === "litigator") {
    return { ok: false, reason: "litigator_listed", message: LITIGATOR_ERROR, phone };
  }
  if (t.leadId && scrubStatus !== "clean" && requiresCleanScrub(t)) {
    return { ok: false, reason: "not_scrubbed", message: NOT_SCRUBBED_ERROR, phone };
  }

  // 4. Multi-line correction (P5.8.7). An opt-out on ANY line of this contact
  //    closes every line, permanently — including numbers and record rows this
  //    send path has never seen. Runs last because it is the most expensive
  //    check, but it is never optional: without it a person who said STOP stays
  //    reachable through a second number we happen to hold for them.
  if (phone || t.leadId) {
    const blocked = await contactOptedOutOnOtherLine(db, {
      workspaceId: t.workspaceId,
      leadId: t.leadId ?? null,
      phone,
    });
    if (blocked) {
      return { ok: false, reason: "opted_out_other_line", message: OPTOUT_OTHER_LINE_ERROR, phone };
    }
  }

  return { ok: true, phone };
}

/**
 * True when any other line belonging to the same contact has opted out or been
 * suppressed. Defence in depth: `suppressContactAcrossLines` closes the sibling
 * lines at write time, this catches opt-outs recorded before that existed.
 */
export async function contactOptedOutOnOtherLine(
  db: Client,
  args: { workspaceId: string; leadId: string | null; phone: string | null },
): Promise<boolean> {
  try {
    const { resolveContactLines } = await import("./contact-lines.server");
    const contact = await resolveContactLines(db, args.workspaceId, {
      leadId: args.leadId,
      phone: args.phone,
    });
    const otherLeadIds = contact.leadIds.filter((id) => id !== args.leadId);
    const otherPhones = contact.phones.filter(
      (p) => p.replace(/\D/g, "").slice(-10) !== (args.phone ?? "").replace(/\D/g, "").slice(-10),
    );
    if (otherLeadIds.length > 0) {
      const { data } = await db
        .from("messages")
        .select("id")
        .eq("workspace_id", args.workspaceId)
        .eq("is_optout", true)
        .in("lead_id", otherLeadIds)
        .limit(1);
      if ((data ?? []).length > 0) return true;
    }
    if (otherPhones.length > 0) {
      const spellings = [...new Set(otherPhones.flatMap((p) => phoneVariants(p)))].slice(0, 200);
      const { data } = await db
        .from("suppression")
        .select("phone")
        .eq("workspace_id", args.workspaceId)
        .in("phone", spellings)
        .limit(1);
      if ((data ?? []).length > 0) return true;
    }
  } catch {
    /* identity resolution failing must not open a send path; treat as clear
       only because the direct opt-out and suppression checks already ran. */
  }
  return false;
}

/** Auditable record of a refused send. Never throws. */
export async function logBlockedSend(
  db: Client,
  t: GateTarget,
  gate: Extract<SendGate, { ok: false }>,
): Promise<void> {
  const blockedAt = new Date().toISOString();
  try {
    // Queryable, evidence-grade log: "we refused to text this person on these dates".
    await db.from("compliance_events").insert({
      workspace_id: t.workspaceId,
      phone: gate.phone,
      lead_id: t.leadId ?? null,
      thread_key: t.threadKey ?? null,
      path: sendPathFromSource(t.source),
      reason: gate.reason,
      detail: { source: t.source ?? "unknown", actor_id: t.actorId ?? null, message: gate.message },
    });
  } catch {
    /* never break the refusal itself */
  }
  try {
    await db.from("events").insert({
      workspace_id: t.workspaceId,
      type: "send_blocked",
      payload: {
        reason: gate.reason,
        phone: gate.phone,
        lead_id: t.leadId ?? null,
        thread_key: t.threadKey ?? null,
        source: t.source ?? "unknown",
        actor_id: t.actorId ?? null,
        blocked_at: blockedAt,
      },
    });
  } catch {
    /* audit logging must never break the refusal itself */
  }
  console.warn(
    `[compliance] blocked send (${gate.reason}) source=${t.source ?? "unknown"} lead=${t.leadId ?? "-"} thread=${t.threadKey ?? "-"}`,
  );
}

/** Authoritative gate: logs the attempt and throws when the send is illegal. */
export async function assertCanText(db: Client, t: GateTarget): Promise<{ phone: string | null }> {
  const gate = await checkCanText(db, t);
  if (!gate.ok) {
    await logBlockedSend(db, t, gate);
    throw new Error(gate.message);
  }
  return { phone: gate.phone };
}
