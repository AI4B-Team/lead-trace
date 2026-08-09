import { describe, expect, it } from "vitest";
import { classifyThread } from "./labeler.shared";
import { AgentGuardrailError, assertAgentMayWrite, assertModeAllowed, assertProposalAllowed } from "./guardrails";
import { ineligibleReason, nominateLeads, scoreLead, type ScoutLead } from "./scout.shared";

const msg = (direction: string, body: string, extra: Record<string, unknown> = {}) => ({
  direction,
  body,
  created_at: "2026-01-10T12:00:00Z",
  ...extra,
});

describe("conversation labeler", () => {
  it("records opt-out above everything else", () => {
    const l = classifyThread({
      messages: [msg("outbound", "hi"), msg("inbound", "stop", { is_optout: true })],
    });
    expect(l.outcome).toBe("opted_out");
    expect(l.confidence).toBe(1);
  });

  it("counts touches before a silent thread", () => {
    const l = classifyThread({ messages: [msg("outbound", "a"), msg("outbound", "b")] });
    expect(l.outcome).toBe("went_quiet");
    expect(l.touchesBeforeOutcome).toBe(2);
  });

  it("names the objection instead of collapsing it to 'negative'", () => {
    const l = classifyThread({
      messages: [msg("outbound", "any interest?"), msg("inbound", "I'm working with my lender already")],
    });
    expect(l.outcome).toBe("objection_raised");
    expect(l.objectionCategory).toBe("already_working_with_lender");
  });

  it("keeps distress separate from negative sentiment", () => {
    const l = classifyThread({
      messages: [msg("inbound", "my husband passed away and I can't afford the payments")],
    });
    expect(l.sentiment).toBe("distressed");
    expect(l.flagged).toBe(true);
  });

  it("says 'unclear' rather than guessing", () => {
    const l = classifyThread({ messages: [msg("inbound", "hmm")] });
    expect(l.outcome).toBe("unclear");
    expect(l.flagged).toBe(true);
  });

  it("counts days remaining to the anchor date", () => {
    const l = classifyThread({
      messages: [msg("inbound", "how much would you offer")],
      anchorDate: "2026-01-20T12:00:00Z",
      outcomeAt: "2026-01-10T12:00:00Z",
    });
    expect(l.outcome).toBe("price_question");
    expect(l.anchorDaysRemaining).toBe(10);
  });
});

describe("agent guardrails", () => {
  it("blocks writes to compliance tables", () => {
    expect(() => assertAgentMayWrite("suppression")).toThrow(AgentGuardrailError);
    expect(() => assertAgentMayWrite("compliance_events")).toThrow();
    expect(() => assertAgentMayWrite("bot_profiles", "system_prompt")).not.toThrow();
  });

  it("blocks changes to send-permission fields", () => {
    expect(() => assertAgentMayWrite("bot_profiles", "quiet_hours")).toThrow();
  });

  it("rejects removing an escalation trigger but allows adding one", () => {
    const base = {
      proposalType: "guardrail",
      targetTable: "bot_profiles",
      targetField: "escalation_triggers",
      rationale: "seen in 4 threads",
    };
    expect(() =>
      assertProposalAllowed({ ...base, currentValue: ["lawyer", "bankruptcy"], proposedValue: ["lawyer"] }),
    ).toThrow(/only add/);
    expect(() =>
      assertProposalAllowed({
        ...base,
        currentValue: ["lawyer"],
        proposedValue: ["lawyer", "bankruptcy"],
      }),
    ).not.toThrow();
  });

  it("requires a rationale", () => {
    expect(() => assertProposalAllowed({ proposalType: "copy_edit", rationale: " " })).toThrow();
  });

  it("never lets the Coach go active", () => {
    expect(() => assertModeAllowed("coach", "active")).toThrow();
    expect(() => assertModeAllowed("lead_scout", "active")).not.toThrow();
  });
});

const NOW = new Date("2026-02-01T12:00:00Z").getTime();
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const lead = (over: Partial<ScoutLead> = {}): ScoutLead => ({
  id: "l1",
  fullName: "Jane Doe",
  address: "1 Main St",
  city: "Tampa",
  state: "FL",
  phone: "8135550100",
  phoneType: "mobile",
  disposition: "new",
  recordTypes: ["pre_foreclosure"],
  sourceTypes: ["county"],
  listCount: 1,
  firstSeenAt: day(60),
  lastSeenAt: day(2),
  lastTouchedAt: null,
  touches: 0,
  hasReplied: false,
  lastOutcome: null,
  sequenceStatus: null,
  anchorDaysRemaining: null,
  ...over,
});

describe("lead scout", () => {
  it("keeps live conversations out of the Scout's hands", () => {
    expect(ineligibleReason(lead({ hasReplied: true, touches: 1, lastTouchedAt: day(20) }), NOW)).toMatch(
      /human/,
    );
  });

  it("never nominates a lead in an active sequence or a terminal outcome", () => {
    expect(ineligibleReason(lead({ sequenceStatus: "active" }), NOW)).toMatch(/active sequence/);
    expect(ineligibleReason(lead({ lastOutcome: "wrong_number" }), NOW)).toMatch(/wrong_number/);
    expect(ineligibleReason(lead({ phone: null }), NOW)).toMatch(/no phone/);
  });

  it("does not re-nominate a lead touched a couple of days ago", () => {
    expect(ineligibleReason(lead({ touches: 1, lastTouchedAt: day(1) }), NOW)).toMatch(/last few days/);
    expect(ineligibleReason(lead({ touches: 1, lastTouchedAt: day(40) }), NOW)).toBeNull();
  });

  it("ranks an imminent key date above a plain untouched lead", () => {
    const urgent = scoreLead(lead({ id: "a", anchorDaysRemaining: 9 }), NOW);
    const plain = scoreLead(lead({ id: "b" }), NOW);
    expect(urgent.score).toBeGreaterThan(plain.score);
    expect(urgent.reasons.join(" ")).toMatch(/9 days away/);
  });

  it("prefers an old cold lead over a heavily worked one", () => {
    const cold = scoreLead(lead({ id: "a", touches: 1, lastTouchedAt: day(90) }), NOW);
    const worked = scoreLead(lead({ id: "b", touches: 8, lastTouchedAt: day(90) }), NOW);
    expect(cold.score).toBeGreaterThan(worked.score);
  });

  it("always states a reason and honours the nomination limit", () => {
    const { nominations, skipped } = nominateLeads(
      [lead({ id: "a" }), lead({ id: "b", anchorDaysRemaining: 3 }), lead({ id: "c", phone: null })],
      1,
      NOW,
    );
    expect(nominations).toHaveLength(1);
    expect(nominations[0]!.leadId).toBe("b");
    expect(nominations[0]!.reasons.length).toBeGreaterThan(0);
    expect(skipped["no phone on file"]).toBe(1);
  });
});