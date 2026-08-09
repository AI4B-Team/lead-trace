/**
 * P5.8.2 — Lead Scout. Reads the whole book of leads and nominates the ones
 * genuinely worth a touch today.
 *
 * It never sends, never enrols a lead in a campaign and never changes lead
 * state. A nomination is not a proposal: it is "here is who to work", so it
 * lands in the worklist with an inline dismiss rather than in the approval
 * queue. Suppressed phones, opted-out contacts and untrusted (legacy or
 * unverified) data are dropped before scoring — the Scout is not allowed to be
 * the place a compliance or data-honesty mistake originates.
 */
import { nominateLeads, normaliseWeights, SCOUT_VERSION, type ScoutLead } from "./scout.shared";
import { groupContacts, normalisePhone10, type ContactLine } from "@/lib/contact-lines.shared";
import { TRUSTED_PROVENANCE, isTrustedProvenance } from "@/lib/provenance.shared";
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
          "id, full_name, address, city, state, zip, email, phone, phone_type, disposition, record_types, source_types, list_count, first_seen_at, last_seen_at, data_provenance",
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
  const allRows = leads as Array<Record<string, unknown>>;

  // H3, through the door the Scout opened: a lead whose provenance is not
  // verified (or a list the operator uploaded themselves) is never nominated
  // for outreach, no matter how well it scores. Legacy demo rows are the exact
  // thing this rule exists to stop.
  const rows = allRows.filter((r) => isTrustedProvenance((r["data_provenance"] as string | null) ?? null));
  const untrusted = allRows.length - rows.length;
  if (rows.length === 0) {
    return {
      status: "ok",
      examined: 0,
      summary: `read ${allRows.length} leads, none with verified provenance — skipped ${untrusted} unverified (${TRUSTED_PROVENANCE.join(" or ")} required)`,
    };
  }

  // P5.8.7 — group the book into contacts first. One person held under two
  // record types is one person: their opt-out covers both lines, their touches
  // are counted together, and only their best line gets nominated.
  const contactLines: ContactLine[] = rows.map((r) => ({
    id: String(r["id"]),
    phone: (r["phone"] as string | null) ?? null,
    fullName: (r["full_name"] as string | null) ?? null,
    address: (r["address"] as string | null) ?? null,
    zip: (r["zip"] as string | null) ?? null,
    email: (r["email"] as string | null) ?? null,
  }));
  const contactKeyByLead = groupContacts(contactLines);
  const linesPerContact = new Map<string, number>();
  const touchesPerContact = new Map<string, number>();
  const optedOutContacts = new Set<string>();
  for (const r of rows) {
    const id = String(r["id"]);
    const key = contactKeyByLead.get(id) ?? `line:${id}`;
    linesPerContact.set(key, (linesPerContact.get(key) ?? 0) + 1);
    const touch = touchByLead.get(id);
    touchesPerContact.set(key, (touchesPerContact.get(key) ?? 0) + (touch?.touches ?? 0));
    const norm = normalisePhone10((r["phone"] as string | null) ?? null);
    if (touch?.optedOut || (norm && suppressedPhones.has(norm))) optedOutContacts.add(key);
  }

  const byId = new Map<string, Record<string, unknown>>();
  const candidates: ScoutLead[] = [];
  let suppressedCount = 0;

  for (const r of rows) {
    const id = String(r["id"]);
    const phone = (r["phone"] as string | null) ?? null;
    const touch = touchByLead.get(id);
    const contactKey = contactKeyByLead.get(id) ?? `line:${id}`;
    if (optedOutContacts.has(contactKey)) {
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
      contactKey,
      contactLines: linesPerContact.get(contactKey) ?? 1,
      contactTouches: touchesPerContact.get(contactKey) ?? 0,
      contactOptedOut: optedOutContacts.has(contactKey),
    });
  }

  // The Hot-Lead Scorer keeps the learned weighting on its own row; until it has
  // fit anything, this falls back to the defaults.
  const { data: scorerRow } = await db
    .from("background_agents")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("agent_key", "hot_lead_scorer")
    .maybeSingle();
  const scorerConfig = (scorerRow as { config?: { weights?: unknown; last_fit_at?: string } } | null)?.config;
  const weights = normaliseWeights(scorerConfig?.weights);
  const weightsFitted = Boolean(scorerConfig?.last_fit_at);

  const { nominations, skipped, coldStart } = nominateLeads(candidates, limit, now, weights, weightsFitted);
  if (nominations.length === 0) {
    return {
      status: "ok",
      examined: candidates.length,
      summary: `read ${rows.length} leads, nothing worth nominating today`,
    };
  }

  // Nominations go straight to the worklist. A row a person already dismissed
  // stays dismissed: re-suggesting it every three hours is nagging, not work.
  const { data: existingNoms } = await db
    .from("worklist_nominations")
    .select("lead_id, status")
    .eq("workspace_id", workspaceId);
  const settled = new Set(
    ((existingNoms ?? []) as Array<{ lead_id: string; status: string }>)
      .filter((n) => n.status !== "open")
      .map((n) => n.lead_id),
  );

  const payload = nominations
    .filter((nom) => !settled.has(nom.leadId))
    .map((nom) => {
      const lead = byId.get(nom.leadId);
      return {
        workspace_id: workspaceId,
        lead_id: nom.leadId,
        agent_id: agent.id,
        score: nom.score,
        reasons: nom.reasons,
        signals: nom.signals,
        record_types: ((lead?.["record_types"] as string[] | null) ?? []) as string[],
        cold_start: coldStart || nom.coldStart,
        scout_version: SCOUT_VERSION,
        status: "open",
        nominated_at: new Date().toISOString(),
      };
    });

  let written = 0;
  if (payload.length > 0) {
    const { error: nomErr } = await db
      .from("worklist_nominations")
      .upsert(payload as never, { onConflict: "workspace_id,lead_id" });
    if (nomErr) return { status: "failed", examined: candidates.length, error: nomErr.message };
    written = payload.length;
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
    summary: `read ${rows.length} verified leads${untrusted > 0 ? ` (ignored ${untrusted} unverified)` : ""}, nominated ${written}${coldStart ? " — no urgency signal yet, newest unworked first" : ""}${suppressedCount > 0 ? `, dropped ${suppressedCount} suppressed` : ""}${topSkips ? ` — skipped ${topSkips}` : ""}`,
  };
}