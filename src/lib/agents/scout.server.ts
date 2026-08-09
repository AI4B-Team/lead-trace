/**
 * P5.8.2 — Lead Scout. Reads the whole book of leads and nominates the ones
 * genuinely worth a touch today.
 *
 * It never sends, never enrols a lead in a campaign and never changes lead
 * state. A nomination is a proposal a person accepts. Suppressed and
 * opted-out phones are dropped before scoring — the Scout is not allowed to
 * be the place a compliance mistake originates.
 */
import { nominateLeads, SCOUT_VERSION, type ScoutLead } from "./scout.shared";
import { writeProposal } from "./store.server";
import type { AgentRow, RunOutcome } from "./store.server";

const DEFAULT_NOMINATIONS = 15;
const LEAD_SCAN_LIMIT = 5000;

function normalisePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export async function runLeadScout(agent: AgentRow): Promise<RunOutcome> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const workspaceId = agent.workspace_id;
  if (!workspaceId) return { status: "skipped", summary: "Lead Scout is workspace-scoped" };

  const limit = Number((agent.config as { nominations?: number })?.nominations ?? DEFAULT_NOMINATIONS);

  const [{ data: leads, error: leadErr }, { data: suppressed }, { data: msgs }, { data: seq }, { data: outcomes }] =
    await Promise.all([
      db
        .from("lead_records")
        .select(
          "id, full_name, address, city, state, phone, phone_type, disposition, record_types, source_types, list_count, first_seen_at, last_seen_at",
        )
        .eq("workspace_id", workspaceId)
        .limit(LEAD_SCAN_LIMIT),
      db.from("suppression").select("phone").eq("workspace_id", workspaceId).limit(20000),
      db
        .from("messages")
        .select("lead_id, direction, is_optout, created_at")
        .eq("workspace_id", workspaceId)
        .not("lead_id", "is", null)
        .limit(20000),
      db
        .from("lead_sequence_state")
        .select("lead_id, status, anchor_date")
        .eq("workspace_id", workspaceId)
        .limit(20000),
      db
        .from("conversation_outcomes")
        .select("lead_id, outcome, labeled_at")
        .eq("workspace_id", workspaceId)
        .is("superseded_at", null)
        .order("labeled_at", { ascending: true })
        .limit(20000),
    ]);
  if (leadErr) return { status: "failed", error: leadErr.message };
  if (!leads || leads.length === 0) return { status: "ok", summary: "no leads to read" };

  const suppressedPhones = new Set(
    ((suppressed ?? []) as Array<{ phone: string }>)
      .map((s) => normalisePhone(s.phone))
      .filter((p): p is string => Boolean(p)),
  );

  type Touch = { touches: number; lastTouchedAt: string | null; hasReplied: boolean; optedOut: boolean };
  const touchByLead = new Map<string, Touch>();
  for (const m of (msgs ?? []) as Array<{
    lead_id: string;
    direction: string;
    is_optout: boolean | null;
    created_at: string;
  }>) {
    const t = touchByLead.get(m.lead_id) ?? { touches: 0, lastTouchedAt: null, hasReplied: false, optedOut: false };
    if (m.direction === "outbound") {
      t.touches += 1;
      if (!t.lastTouchedAt || m.created_at > t.lastTouchedAt) t.lastTouchedAt = m.created_at;
    } else {
      t.hasReplied = true;
    }
    if (m.is_optout) t.optedOut = true;
    touchByLead.set(m.lead_id, t);
  }

  const seqByLead = new Map(
    ((seq ?? []) as Array<{ lead_id: string; status: string | null; anchor_date: string | null }>).map((s) => [
      s.lead_id,
      s,
    ]),
  );
  const outcomeByLead = new Map<string, string>();
  for (const o of (outcomes ?? []) as Array<{ lead_id: string | null; outcome: string }>) {
    if (o.lead_id) outcomeByLead.set(o.lead_id, o.outcome); // ascending order → last wins
  }

  const now = Date.now();
  const rows = leads as Array<Record<string, unknown>>;
  const byId = new Map<string, Record<string, unknown>>();
  const candidates: ScoutLead[] = [];
  let suppressedCount = 0;

  for (const r of rows) {
    const id = String(r["id"]);
    const phone = (r["phone"] as string | null) ?? null;
    const touch = touchByLead.get(id);
    const norm = normalisePhone(phone);
    if (touch?.optedOut || (norm && suppressedPhones.has(norm))) {
      suppressedCount += 1;
      continue;
    }
    const seqRow = seqByLead.get(id);
    const anchor = seqRow?.anchor_date ? new Date(seqRow.anchor_date).getTime() : null;
    byId.set(id, r);
    candidates.push({
      id,
      fullName: (r["full_name"] as string | null) ?? null,
      address: (r["address"] as string | null) ?? null,
      city: (r["city"] as string | null) ?? null,
      state: (r["state"] as string | null) ?? null,
      phone,
      phoneType: (r["phone_type"] as string | null) ?? null,
      disposition: String(r["disposition"] ?? "new"),
      recordTypes: (r["record_types"] as string[] | null) ?? [],
      sourceTypes: (r["source_types"] as string[] | null) ?? [],
      listCount: Number(r["list_count"] ?? 0),
      firstSeenAt: (r["first_seen_at"] as string | null) ?? null,
      lastSeenAt: (r["last_seen_at"] as string | null) ?? null,
      lastTouchedAt: touch?.lastTouchedAt ?? null,
      touches: touch?.touches ?? 0,
      hasReplied: touch?.hasReplied ?? false,
      lastOutcome: outcomeByLead.get(id) ?? null,
      sequenceStatus: seqRow?.status ?? null,
      anchorDaysRemaining:
        anchor !== null && !Number.isNaN(anchor) ? Math.ceil((anchor - now) / 86_400_000) : null,
    });
  }

  const { nominations, skipped } = nominateLeads(candidates, limit, now);
  if (nominations.length === 0) {
    return {
      status: "ok",
      examined: candidates.length,
      summary: `read ${rows.length} leads, nothing worth nominating today`,
    };
  }

  // One proposal per nomination so an operator accepts or declines leads
  // individually rather than approving a block.
  const { data: openProposals } = await db
    .from("agent_proposals")
    .select("target_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", "lead_scout")
    .eq("status", "pending");
  const alreadyOpen = new Set(
    ((openProposals ?? []) as Array<{ target_id: string | null }>)
      .map((p) => p.target_id)
      .filter((v): v is string => Boolean(v)),
  );

  let written = 0;
  for (const nom of nominations) {
    if (alreadyOpen.has(nom.leadId)) continue;
    const lead = byId.get(nom.leadId);
    const who =
      (lead?.["full_name"] as string | null) ||
      (lead?.["address"] as string | null) ||
      (lead?.["phone"] as string | null) ||
      "Lead";
    const where = [lead?.["city"], lead?.["state"]].filter(Boolean).join(", ");
    await writeProposal(agent, {
      proposalType: "lead_nomination",
      targetTable: "lead_records",
      targetId: nom.leadId,
      targetField: null,
      proposedValue: {
        score: nom.score,
        reasons: nom.reasons,
        who,
        where,
        version: SCOUT_VERSION,
      },
      rationale: `${who}${where ? ` (${where})` : ""} — ${nom.reasons.join("; ")}.`,
      evidenceRefs: [{ table: "lead_records", id: nom.leadId }],
    });
    written += 1;
  }

  if (written > 0 && agent.mode === "active") {
    await db.from("notifications").insert({
      workspace_id: workspaceId,
      kind: "agent",
      title: `Lead Scout nominated ${written} lead${written === 1 ? "" : "s"}`,
      body: "Review the nominations on the Background Agents page.",
    } as never);
  }

  const topSkips = Object.entries(skipped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, n]) => `${reason}: ${n}`)
    .join(", ");

  return {
    status: "ok",
    examined: candidates.length,
    actioned: written,
    flagged: written,
    summary: `read ${rows.length} leads, nominated ${written}${suppressedCount > 0 ? `, dropped ${suppressedCount} suppressed` : ""}${topSkips ? ` — skipped ${topSkips}` : ""}`,
  };
}