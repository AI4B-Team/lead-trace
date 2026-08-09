import { describe, expect, it } from "vitest";
import { classifyThread } from "./labeler.shared";
import { AgentGuardrailError, assertAgentMayWrite, assertModeAllowed, assertProposalAllowed } from "./guardrails";

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