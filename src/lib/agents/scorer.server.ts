/**
 * P5.8.3 — Hot-Lead Scorer runner.
 *
 * Reads this workspace's own finished conversations, works out which of the
 * Scout's named signals actually preceded a booking, and refits the weighting.
 * In flag-only mode the refit arrives as a proposal; in active mode it is
 * applied to its own weighting and still logged as a proposal so the change
 * stays auditable. It never touches compliance state or lead state.
 *
 * Conversation outcomes hang off campaign lead rows, so the deduplicated Leads
 * library is joined in by phone to recover record/source signals.
 */
import { describeChange, fitSignalWeights, SCORER_VERSION } from "./scorer.shared";
import { normaliseWeights, scoreLead, type ScoutLead, type SignalKey } from "./scout.shared";
import { writeProposal, type AgentRow, type RunOutcome } from "./store.server";

/** Outcomes that count as a win for the purposes of learning. */
const WON_OUTCOMES = new Set(["booked", "converted"]);
const WON_DISPOSITIONS = new Set(["won", "converted", "closed_won", "appointment_set"]);

function normalisePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export async function runHotLeadScorer(agent: AgentRow): Promise<RunOutcome> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const workspaceId = agent.workspace_id;
  if (!workspaceId) return { status: "skipped", summary: "Hot-Lead Scorer is workspace-scoped" };

  const [
    { data: outcomes, error: outErr },
    { data: leads },
    { data: records },
    { data: msgs },
    { data: seq },
  ] = await Promise.all([
    db
      .from("conversation_outcomes")
      .select("lead_id, outcome, anchor_days_remaining, labeled_at")
      .eq("workspace_id", workspaceId)
      .is("superseded_at", null)
      .not("lead_id", "is", null)
      .limit(20000),
    db
      .from("leads")
      .select("id, phone, phone_type, created_at")
      .eq("workspace_id", workspaceId)
      .limit(20000),
    db
      .from("lead_records")
      .select("phone, phone_type, disposition, record_types, source_types, list_count, first_seen_at")
      .eq("workspace_id", workspaceId)
      .limit(20000),
    db
      .from("messages")
      .select("lead_id, direction, created_at")
      .eq("workspace_id", workspaceId)
      .not("lead_id", "is", null)
      .limit(20000),
    db
      .from("lead_sequence_state")
      .select("lead_id, anchor_date")
      .eq("workspace_id", workspaceId)
      .limit(20000),
  ]);
  if (outErr) return { status: "failed", error: outErr.message };

  const leadById = new Map(
    ((leads ?? []) as Array<Record<string, unknown>>).map((r) => [String(r["id"]), r]),
  );
  const recordByPhone = new Map<string, Record<string, unknown>>();
  for (const r of (records ?? []) as Array<Record<string, unknown>>) {
    const key = normalisePhone((r["phone"] as string | null) ?? null);
    if (key && !recordByPhone.has(key)) recordByPhone.set(key, r);
  }

  const touchByLead = new Map<string, { touches: number; last: string | null; replied: boolean }>();
  for (const m of (msgs ?? []) as Array<{ lead_id: string; direction: string; created_at: string }>) {
    const t = touchByLead.get(m.lead_id) ?? { touches: 0, last: null, replied: false };
    if (m.direction === "outbound") {
      t.touches += 1;
      if (!t.last || m.created_at > t.last) t.last = m.created_at;
    } else t.replied = true;
    touchByLead.set(m.lead_id, t);
  }
  const anchorByLead = new Map(
    ((seq ?? []) as Array<{ lead_id: string; anchor_date: string | null }>).map((s) => [
      s.lead_id,
      s.anchor_date,
    ]),
  );

  const samples: Array<{ signals: SignalKey[]; converted: boolean }> = [];
  for (const o of (outcomes ?? []) as Array<{
    lead_id: string;
    outcome: string;
    anchor_days_remaining: number | null;
    labeled_at: string | null;
  }>) {
    const lr = leadById.get(o.lead_id);
    if (!lr) continue;
    const phone = normalisePhone((lr["phone"] as string | null) ?? null);
    const rec = phone ? recordByPhone.get(phone) : undefined;
    const touch = touchByLead.get(o.lead_id);
    // Signals are read as of the labeled conversation, not as of today.
    const asOf = o.labeled_at ? new Date(o.labeled_at).getTime() : Date.now();
    const anchorIso = anchorByLead.get(o.lead_id) ?? null;
    const disposition = String(rec?.["disposition"] ?? "new");
    const lead: ScoutLead = {
      id: o.lead_id,
      fullName: null,
      address: null,
      city: null,
      state: null,
      phone: (lr["phone"] as string | null) ?? null,
      phoneType: ((lr["phone_type"] as string | null) ?? (rec?.["phone_type"] as string | null)) ?? null,
      disposition,
      recordTypes: (rec?.["record_types"] as string[] | null) ?? [],
      sourceTypes: (rec?.["source_types"] as string[] | null) ?? [],
      listCount: Number(rec?.["list_count"] ?? 0),
      firstSeenAt:
        ((rec?.["first_seen_at"] as string | null) ?? (lr["created_at"] as string | null)) ?? null,
      lastSeenAt: null,
      lastTouchedAt: touch?.last ?? null,
      touches: touch?.touches ?? 0,
      hasReplied: touch?.replied ?? false,
      lastOutcome: null,
      sequenceStatus: null,
      anchorDaysRemaining:
        o.anchor_days_remaining ??
        (anchorIso ? Math.ceil((new Date(anchorIso).getTime() - asOf) / 86_400_000) : null),
    };
    const { signals } = scoreLead(lead, asOf);
    samples.push({
      signals,
      converted: WON_OUTCOMES.has(o.outcome) || WON_DISPOSITIONS.has(disposition.toLowerCase()),
    });
  }

  const current = normaliseWeights((agent.config as { weights?: unknown })?.weights);
  const fit = fitSignalWeights(samples, current);

  const stamp = async () => {
    await db
      .from("background_agents")
      .update({
        config: { ...(agent.config ?? {}), weights: fit.weights, last_fit_at: new Date().toISOString() },
      } as never)
      .eq("id", agent.id);
  };

  if (fit.status === "insufficient") {
    return { status: "ok", examined: samples.length, summary: fit.note };
  }
  if (fit.changes.length === 0) {
    await stamp();
    return { status: "ok", examined: samples.length, summary: fit.note };
  }

  await writeProposal(agent, {
    proposalType: "scorer_weights",
    targetTable: "background_agents",
    targetId: agent.id,
    targetField: "weights",
    currentValue: current,
    proposedValue: { weights: fit.weights, changes: fit.changes, version: SCORER_VERSION },
    rationale: `${fit.note} ${fit.changes.map(describeChange).join(" ")}`,
    evidenceRefs: [{ table: "conversation_outcomes", count: samples.length }],
  });

  // Active mode applies its own weighting; the proposal above is the audit trail.
  if (agent.mode === "active") await stamp();

  return {
    status: "ok",
    examined: samples.length,
    actioned: agent.mode === "active" ? fit.changes.length : 0,
    flagged: fit.changes.length,
    summary: `${fit.changes.length} signal${fit.changes.length === 1 ? "" : "s"} refit from ${
      samples.length
    } conversations${agent.mode === "active" ? " (applied)" : " (proposed)"}`,
  };
}
