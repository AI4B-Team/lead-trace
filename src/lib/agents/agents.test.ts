import { describe, expect, it } from "vitest";
import { classifyThread } from "./labeler.shared";
import { fitSignalWeights, MIN_SAMPLES } from "./scorer.shared";
import { DEFAULT_SIGNAL_WEIGHTS, type SignalKey } from "./scout.shared";
import { AgentGuardrailError, assertAgentMayWrite, assertModeAllowed, assertProposalAllowed } from "./guardrails";
import { auditBooking, rankFindings } from "./booking.shared";
import { draftWisdom } from "./wisdom.shared";
import { extractTakeovers } from "./wisdom.server";
import { ineligibleReason, nominateLeads, scoreLead, type ScoutLead } from "./scout.shared";
import { draftCoachEdits, type CoachConversation } from "./coach.shared";

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

describe("hot-lead scorer", () => {
  const sample = (signals: SignalKey[], converted: boolean) => ({ signals, converted });

  it("refuses to refit on thin history", () => {
    const fit = fitSignalWeights([sample(["never_touched"], true), sample(["gone_cold"], false)]);
    expect(fit.status).toBe("insufficient");
    expect(fit.weights).toEqual(DEFAULT_SIGNAL_WEIGHTS);
    expect(fit.note).toMatch(/not enough/i);
  });

  it("raises a signal that converts better than baseline", () => {
    const samples = [
      ...Array.from({ length: 20 }, () => sample(["price_question"], true)),
      ...Array.from({ length: 40 }, () => sample(["gone_cold"], false)),
    ];
    const fit = fitSignalWeights(samples);
    expect(fit.status).toBe("fitted");
    expect(fit.samples).toBeGreaterThanOrEqual(MIN_SAMPLES);
    expect(fit.weights.price_question).toBeGreaterThan(DEFAULT_SIGNAL_WEIGHTS.price_question);
    expect(fit.changes.some((c) => c.key === "price_question")).toBe(true);
  });

  it("shrinks a penalty when the penalised signal still converts", () => {
    const samples = [
      ...Array.from({ length: 20 }, () => sample(["heavily_touched"], true)),
      ...Array.from({ length: 40 }, () => sample(["multi_list"], false)),
    ];
    const fit = fitSignalWeights(samples);
    expect(fit.weights.heavily_touched).toBeGreaterThan(DEFAULT_SIGNAL_WEIGHTS.heavily_touched);
    expect(fit.weights.heavily_touched).toBeLessThanOrEqual(0);
  });

  it("ignores signals with too few examples to judge", () => {
    const samples = [
      ...Array.from({ length: 5 }, () => sample(["freshly_added"], true)),
      ...Array.from({ length: 50 }, () => sample(["gone_cold"], false)),
    ];
    const fit = fitSignalWeights(samples);
    expect(fit.changes.some((c) => c.key === "freshly_added")).toBe(false);
  });

  it("never moves a weight beyond half or double its default", () => {
    const samples = [
      ...Array.from({ length: 30 }, () => sample(["mobile_verified"], true)),
      ...Array.from({ length: 30 }, () => sample(["multi_source"], false)),
    ];
    const fit = fitSignalWeights(samples);
    expect(fit.weights.mobile_verified).toBeLessThanOrEqual(DEFAULT_SIGNAL_WEIGHTS.mobile_verified * 2);
    expect(fit.weights.multi_source).toBeGreaterThanOrEqual(DEFAULT_SIGNAL_WEIGHTS.multi_source * 0.5);
  });
});

describe("agent guardrails (rules)", () => {
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
    // No agent is active-capable today, so 'active' is refused everywhere
    // rather than being a switch that silently changes nothing.
    expect(() => assertModeAllowed("lead_scout", "active")).toThrow();
    expect(() => assertModeAllowed("lead_scout", "flag_only")).not.toThrow();
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
// ---------------------------------------------------------------------------
// P5.8.5 — the Coach. It only ever adds wording, and it stays quiet on thin
// history. Both are safety properties, not preferences.
// ---------------------------------------------------------------------------
describe("coach drafts", () => {
  const profile = {
    id: "p1",
    name: "Distress Feed",
    opener: "Hi, saw your property in county records and wanted to reach out.",
    objections: [],
    faqs: [],
    escalationTriggers: [],
  };

  function convo(i: number, over: Partial<CoachConversation> = {}): CoachConversation {
    return {
      threadKey: `t${i}`,
      outcome: "not_interested",
      objectionCategory: null,
      sentiment: null,
      inbound: [],
      noReply: false,
      ...over,
    };
  }

  it("says nothing on thin history", () => {
    const drafts = draftCoachEdits(profile, [
      convo(1, { objectionCategory: "price" }),
      convo(2, { objectionCategory: "price" }),
    ]);
    expect(drafts).toHaveLength(0);
  });

  it("drafts an approved answer once an objection recurs", () => {
    const convos = [1, 2, 3, 4, 5].map((i) => convo(i, { objectionCategory: "price" }));
    const drafts = draftCoachEdits(profile, convos);
    const objection = drafts.find((d) => d.field === "objections");
    expect(objection).toBeTruthy();
    expect((objection!.value as unknown[]).length).toBe(1);
    expect(objection!.evidence.length).toBe(5);
  });

  it("never removes existing wording", () => {
    const withExisting = {
      ...profile,
      faqs: [{ q: "Existing question?", a: "Existing answer." }],
      escalationTriggers: ["hospice"],
    };
    const convos = [1, 2, 3, 4, 5].map((i) =>
      convo(i, { inbound: ["where did you get my number", "call me"] }),
    );
    const drafts = draftCoachEdits(withExisting, convos);
    for (const d of drafts) {
      if (!Array.isArray(d.current)) continue;
      const after = d.value as unknown[];
      for (const item of d.current as unknown[]) {
        expect(after).toContainEqual(item);
      }
    }
  });

  it("does not re-propose an escalation trigger already in the profile", () => {
    const convos = [1, 2, 3, 4, 5].map((i) => convo(i, { inbound: ["my lawyer said to stop"] }));
    const drafts = draftCoachEdits({ ...profile, escalationTriggers: ["lawyer"] }, convos);
    expect(drafts.some((d) => d.field === "escalation_triggers")).toBe(false);
  });
});

describe("wisdom miner (P5.8.6)", () => {
  const state = { id: "p1", name: "Default", objections: [], faqs: [] };
  const base = { threadKey: "t1", question: "how did you get my info?", gapHours: 1, outcome: null, sentiment: null };
  const goodReply =
    "It's public county records — the filing is listed publicly, and I can take you off my list right now if you'd rather not hear from me.";

  it("captures a solid human answer as additive wording", () => {
    const { drafts } = draftWisdom(state, [{ ...base, humanReply: goodReply }]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.field).toBe("objections");
    expect(drafts[0]!.value).toHaveLength(1);
    expect(drafts[0]!.captured.approved_response).toBe(goodReply);
  });

  it("never removes wording that already exists", () => {
    const seeded = { ...state, objections: [{ trigger: "cost", approved_response: "No fee." }] };
    const { drafts } = draftWisdom(seeded, [{ ...base, humanReply: goodReply }]);
    expect(drafts[0]!.value[0]).toEqual({ trigger: "cost", approved_response: "No fee." });
    expect(drafts[0]!.value).toHaveLength(2);
  });

  it("drops replies carrying one person's details or a specific commitment", () => {
    for (const reply of [
      "Sure, call me back on 305-555-1212 any time and we can talk through the whole situation together.",
      "I can swing by 421 Oak Street tomorrow afternoon and walk the property with you, no obligation at all.",
      "I'll be there Tuesday at 3pm to look at it with you, and we can talk numbers after that walkthrough.",
      "We can pay you $42,000 for it this week, all cash, and cover the closing costs on our side too.",
    ]) {
      const { drafts, rejected } = draftWisdom(state, [{ ...base, humanReply: reply }]);
      expect(drafts).toHaveLength(0);
      expect(rejected["personal_detail"]).toBe(1);
    }
  });

  it("stays quiet on thin replies and on threads that ended badly", () => {
    expect(draftWisdom(state, [{ ...base, humanReply: "yes" }]).drafts).toHaveLength(0);
    expect(
      draftWisdom(state, [{ ...base, humanReply: goodReply, outcome: "opted_out" }]).drafts,
    ).toHaveLength(0);
    expect(
      draftWisdom(state, [{ ...base, humanReply: goodReply, gapHours: 96 }]).drafts,
    ).toHaveLength(0);
  });

  it("keeps the fullest answer when the same question was handled repeatedly", () => {
    const longer = `${goodReply} There is no cost to you either way.`;
    const { drafts } = draftWisdom(state, [
      { ...base, humanReply: goodReply },
      { ...base, threadKey: "t2", humanReply: longer },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.captured.approved_response).toBe(longer);
    expect(drafts[0]!.evidence).toEqual(["t1", "t2"]);
  });

  it("only mines threads the bot was driving, and pairs the right question", () => {
    const rows = [
      { thread_key: "a", direction: "outbound", body: "Hi, saw your filing.", is_bot: true, channel: "sms", created_at: "2026-01-01T10:00:00Z" },
      { thread_key: "a", direction: "inbound", body: "how did you get my info?", is_bot: false, channel: "sms", created_at: "2026-01-01T10:05:00Z" },
      { thread_key: "a", direction: "outbound", body: goodReply, is_bot: false, channel: "sms", created_at: "2026-01-01T10:20:00Z" },
      { thread_key: "b", direction: "inbound", body: "who is this?", is_bot: false, channel: "sms", created_at: "2026-01-01T10:00:00Z" },
      { thread_key: "b", direction: "outbound", body: "Just me.", is_bot: false, channel: "sms", created_at: "2026-01-01T10:01:00Z" },
    ];
    const moments = extractTakeovers(rows);
    expect(moments).toHaveLength(1);
    expect(moments[0]!.threadKey).toBe("a");
    expect(moments[0]!.question).toBe("how did you get my info?");
    expect(moments[0]!.gapHours).toBeCloseTo(0.25, 2);
  });
});

describe("booking auditor (P5.8.4)", () => {
  const t = (
    direction: string,
    body: string,
    is_bot: boolean,
    created_at: string,
  ) => ({ direction, body, is_bot, created_at });

  it("passes a clean booking the lead actually confirmed", () => {
    const finding = auditBooking({
      threadKey: "ok",
      leadId: "l1",
      markedAt: "2026-01-01T12:00:00Z",
      messages: [
        t("outbound", "Could I come by Thursday at 2pm?", true, "2026-01-01T10:00:00Z"),
        t("inbound", "Thursday at 2pm works for me", false, "2026-01-01T11:00:00Z"),
      ],
    }, Date.parse("2026-01-01T13:00:00Z"));
    expect(finding).toBeNull();
  });

  it("flags a booking where the lead never replied", () => {
    const finding = auditBooking({
      threadKey: "silent",
      leadId: null,
      markedAt: "2026-01-01T12:00:00Z",
      messages: [t("outbound", "See you Thursday at 2pm.", true, "2026-01-01T10:00:00Z")],
    }, Date.parse("2026-01-01T13:00:00Z"));
    expect(finding?.issues).toContain("no_lead_confirmation");
    expect(finding?.issues).toContain("no_time_agreed");
  });

  it("flags mismatched times between the lead and the bot", () => {
    const finding = auditBooking({
      threadKey: "drift",
      leadId: "l2",
      markedAt: "2026-01-01T12:00:00Z",
      messages: [
        t("inbound", "friday at 4pm works for me", false, "2026-01-01T10:00:00Z"),
        t("outbound", "Great, confirmed for friday at 2pm.", true, "2026-01-01T10:05:00Z"),
      ],
    }, Date.parse("2026-01-01T13:00:00Z"));
    expect(finding?.issues).toContain("time_mismatch");
    expect(finding?.leadTime).toBe("friday 4:00pm");
    expect(finding?.botTime).toBe("friday 2:00pm");
  });

  it("flags a lead who backed out after the booking was recorded", () => {
    const finding = auditBooking({
      threadKey: "cancel",
      leadId: "l3",
      markedAt: "2026-01-01T12:00:00Z",
      messages: [
        t("outbound", "Thursday at 2pm?", true, "2026-01-01T10:00:00Z"),
        t("inbound", "thursday at 2pm works for me", false, "2026-01-01T10:30:00Z"),
        t("inbound", "actually I can't make it, something came up", false, "2026-01-02T09:00:00Z"),
      ],
    }, Date.parse("2026-01-02T10:00:00Z"));
    expect(finding?.issues).toContain("cancelled_after_booking");
  });

  it("does not treat the lead's question as an agreement", () => {
    const finding = auditBooking({
      threadKey: "asked",
      leadId: "l4",
      markedAt: "2026-01-01T12:00:00Z",
      messages: [
        t("outbound", "Can I come by thursday at 2pm?", true, "2026-01-01T10:00:00Z"),
        t("inbound", "could you do thursday at 5pm instead?", false, "2026-01-01T10:10:00Z"),
      ],
    }, Date.parse("2026-01-01T13:00:00Z"));
    expect(finding?.issues).toContain("bot_assumed_yes");
  });

  it("ranks the worst problem first", () => {
    const stale = auditBooking({
      threadKey: "stale",
      leadId: null,
      markedAt: "2026-01-01T00:00:00Z",
      messages: [
        t("outbound", "Thursday at 2pm.", true, "2026-01-01T00:00:00Z"),
        t("inbound", "who is this", false, "2026-01-01T01:00:00Z"),
      ],
    }, Date.parse("2026-01-05T00:00:00Z"))!;
    const cancelled = auditBooking({
      threadKey: "cancel",
      leadId: null,
      markedAt: "2026-01-01T00:00:00Z",
      messages: [
        t("outbound", "Thursday at 2pm?", true, "2026-01-01T00:00:00Z"),
        t("inbound", "thursday at 2pm works for me", false, "2026-01-01T01:00:00Z"),
        t("inbound", "need to reschedule", false, "2026-01-01T02:00:00Z"),
      ],
    }, Date.parse("2026-01-01T03:00:00Z"))!;
    expect(rankFindings([stale, cancelled])[0]!.threadKey).toBe("cancel");
  });
});
