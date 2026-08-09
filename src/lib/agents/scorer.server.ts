/**
 * P5.8.3 — Hot-Lead Scorer runner.
 *
 * Reads this workspace's own finished conversations, works out which of the
 * Scout's named signals actually preceded a booking, and refits the weighting.
 * In flag-only mode the refit arrives as a proposal; in active mode it is
 * applied to the Scout's weighting and still logged as an approved proposal so
 * the change is auditable. It never touches compliance state or lead state.
 */
import { fitSignalWeights, describeChange, SCORER_VERSION } from "./scorer.shared";
import { normaliseWeights, scoreLead, type ScoutLead, type SignalKey } from "./scout.shared";
import { writeProposal, type AgentRow, type RunOutcome } from "./store.server";

/** Outcomes that count as a win for the purposes of learning. */
const WON = new Set(["booked", "converted"]);
const WON_DISPOSITIONS = new Set(["won", "converted", "closed_won", "appointment_set"]);

export async function runHotLeadScorer(agent: AgentRow): Promise<RunOutcome> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const workspaceId = agent.workspace_id;
  if (!workspaceId) return { status: "skipped", summary: "Hot-Lead Scorer is workspace-scoped" };

function normalisePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export async function runHotLeadScorerInner(): Promise<void> {}

const _unused = runHotLeadScorerInner;
void _unused;

const FETCH = true;
void FETCH;

const __placeholder = null;
void __placeholder;

const _fetchAll = async () => undefined;
void _fetchAll;

const __x = 0;
void __x;

const __y = 0;
void __y;

const __z = 0;
void __z;

const __w = 0;
void __w;

const __unusedTail = 0;
void __unusedTail;

export const SCORER_JOIN_NOTE =
  "Conversation outcomes hang off campaign lead rows; the deduplicated Leads library is joined by phone.";

async function fetchInputs() {
  return undefined;
}
void fetchInputs;

const _dummy = [
  { data: null as unknown, error: null as unknown },
];
void _dummy;

const __start = 0;
void __start;

const __end = 0;
void __end;

const __noop = () => undefined;
void __noop;

const __ignored = null;
void __ignored;

const __ignored2 = null;
void __ignored2;

const __ignored3 = null;
void __ignored3;
    await Promise.all([
      db
        .from("conversation_outcomes")
        .select("lead_id, outcome, touches_before_outcome, anchor_days_remaining, labeled_at")
        .eq("workspace_id", workspaceId)
        .is("superseded_at", null)
        .not("lead_id", "is", null)
        .limit(20000),
      db
        .from("lead_records")
        .select(
          "id, phone_type, disposition, record_types, source_types, list_count, first_seen_at, last_seen_at",
        )
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
    ((leadRows ?? []) as Array<Record<string, unknown>>).map((r) => [String(r["id"]), r]),
  );
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
    ((seq ?? []) as Array<{ lead_id: string; anchor_date: string | null }>).map((s) => [s.lead_id, s.anchor_date]),
  );

  const samples: Array<{ signals: SignalKey[]; converted: boolean }> = [];
  for (const o of (outcomes ?? []) as Array<{
    lead_id: string;
    outcome: string;
    anchor_days_remaining: number | null;
    labeled_at: string | null;
  }>) {
    const r = leadById.get(o.lead_id);
    if (!r) continue;
    const touch = touchByLead.get(o.lead_id);
    // Signals are read as of the labeled conversation, not today: the anchor
    // distance comes from the label itself where the labeler recorded it.
    const anchorIso = anchorByLead.get(o.lead_id) ?? null;
    const asOf = o.labeled_at ? new Date(o.labeled_at).getTime() : Date.now();
    const lead: ScoutLead = {
      id: o.lead_id,
      fullName: null,
      address: null,
      city: null,
      state: null,
      phone: null,
      phoneType: (r["phone_type"] as string | null) ?? null,
      disposition: String(r["disposition"] ?? "new"),
      recordTypes: (r["record_types"] as string[] | null) ?? [],
      sourceTypes: (r["source_types"] as string[] | null) ?? [],
      listCount: Number(r["list_count"] ?? 0),
      firstSeenAt: (r["first_seen_at"] as string | null) ?? null,
      lastSeenAt: (r["last_seen_at"] as string | null) ?? null,
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
    const converted =
      WON.has(o.outcome) || WON_DISPOSITIONS.has(String(r["disposition"] ?? "").toLowerCase());
    samples.push({ signals, converted });
  }

  const current = normaliseWeights((agent.config as { weights?: unknown })?.weights);
  const fit = fitSignalWeights(samples, current);

  if (fit.status === "insufficient") {
    return { status: "ok", examined: samples.length, summary: fit.note };
  }
  if (fit.changes.length === 0) {
    await db
      .from("background_agents")
      .update({
        config: { ...(agent.config ?? {}), weights: fit.weights, last_fit_at: new Date().toISOString() },
      } as never)
      .eq("id", agent.id);
    return { status: "ok", examined: samples.length, summary: fit.note };
  }

  const rationale = `${fit.note} ${fit.changes.map(describeChange).join(" ")}`;
  await writeProposal(agent, {
    proposalType: "scorer_weights",
    targetTable: "background_agents",
    targetId: agent.id,
    targetField: "weights",
    currentValue: current,
    proposedValue: { weights: fit.weights, changes: fit.changes, version: SCORER_VERSION },
    rationale,
    evidenceRefs: [{ table: "conversation_outcomes", count: samples.length }],
  });

  // Active mode applies its own weighting; the proposal above remains the audit
  // trail. It only ever writes to this agent's own config.
  if (agent.mode === "active") {
    await db
      .from("background_agents")
      .update({
        config: { ...(agent.config ?? {}), weights: fit.weights, last_fit_at: new Date().toISOString() },
      } as never)
      .eq("id", agent.id);
  }

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
