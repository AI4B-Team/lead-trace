/**
 * Hard constraints on what a background agent is allowed to touch. Enforced in
 * code at write time — not at review time — because a proposal that weakens a
 * guardrail should never exist long enough for a tired human to approve it.
 *
 * Pure module: no IO, so every rule is directly testable.
 */
import { AGENT_DEFINITIONS } from "./registry.shared";

/** Tables no agent may ever write to, in any mode. */
export const AGENT_FORBIDDEN_TABLES = [
  "compliance_events",
  "suppression",
  "suppression_signals",
  "dnc_subscriptions",
  "source_coverage",
  "scrub_runs",
  "provider_status",
  "county_coverage",
] as const;

/** Fields that decide whether we are allowed to text at all. */
export const AGENT_FORBIDDEN_FIELDS = [
  "messaging_mode",
  "quiet_hours",
  "quiet_hours_start",
  "quiet_hours_end",
  "send_window",
  "regulated_vertical",
  "scrub_status",
  "is_optout",
  "opt_out_text",
  "sender_identification",
  "disclosure_line",
] as const;

/** Guardrail fields where only additive change is permitted. */
export const AGENT_ADDITIVE_ONLY_FIELDS = [
  "escalation_triggers",
  "banned_topics",
  "handoff_patterns",
] as const;

export class AgentGuardrailError extends Error {}

function fail(message: string): never {
  throw new AgentGuardrailError(message);
}

/** Call before any agent-originated write. */
export function assertAgentMayWrite(table: string, field?: string | null): void {
  if ((AGENT_FORBIDDEN_TABLES as readonly string[]).includes(table)) {
    fail(`Agents may not write to ${table}.`);
  }
  if (field && (AGENT_FORBIDDEN_FIELDS as readonly string[]).includes(field)) {
    fail(`Agents may not change ${field}.`);
  }
}

function asList(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map((v) => String(v));
  return null;
}

export type ProposalDraft = {
  proposalType: string;
  targetTable?: string | null;
  targetField?: string | null;
  currentValue?: unknown;
  proposedValue?: unknown;
  rationale: string;
  evidenceRefs?: unknown[];
};

/**
 * Validates a proposal before it is written. Subtractive changes against a
 * guardrail list, and anything touching compliance copy or send permission,
 * are rejected here.
 */
export function assertProposalAllowed(draft: ProposalDraft): void {
  if (!draft.rationale?.trim()) fail("A proposal must cite its evidence in a rationale.");
  if (draft.targetTable) assertAgentMayWrite(draft.targetTable, draft.targetField);
  else if (draft.targetField) assertAgentMayWrite("__none__", draft.targetField);

  const field = draft.targetField ?? "";
  if ((AGENT_ADDITIVE_ONLY_FIELDS as readonly string[]).includes(field)) {
    const before = asList(draft.currentValue) ?? [];
    const after = asList(draft.proposedValue);
    if (!after) fail(`A proposal for ${field} must supply the full list.`);
    const removed = before.filter((v) => !after.includes(v));
    if (removed.length > 0) {
      fail(`Agents may only add to ${field}, never remove (${removed.join(", ")}).`);
    }
  }
}

/** True when this agent is only ever allowed to propose. */
export function isProposalsOnly(agentKey: string): boolean {
  return agentKey === "coach" || agentKey === "wisdom_miner";
}

/** The Coach has no active mode, ever. */
export function assertModeAllowed(agentKey: string, mode: string): void {
  if (!["off", "flag_only", "active"].includes(mode)) fail("Unknown agent mode.");
  if (mode !== "active") return;
  // Permanent, not a phase-one limitation: an agent that edits what the bot
  // says to distressed homeowners only ever proposes, so every wording change
  // has a named approver and a date behind it.
  const def = AGENT_DEFINITIONS.find((a) => a.key === agentKey);
  if (def?.proposalsOnly) {
    fail(`The ${def.name} only ever proposes. It has no active mode.`);
  }
}