/**
 * P5.8.5 — the Coach. Reads finished conversations the way a manager reads call
 * recordings, and drafts specific wording edits to a bot profile.
 *
 * Two hard properties, both of them here rather than in policy:
 *
 * 1. It only ever ADDS wording. It never removes an approved objection answer,
 *    an FAQ, an escalation trigger, or a banned topic — so no proposal it files
 *    can quietly delete the thing that was keeping the bot safe.
 * 2. Every draft carries the transcript keys and counts it was derived from, so
 *    the person approving it can go read the conversations that produced it.
 *
 * Pure module: no IO, so every rule is directly testable.
 */

export const COACH_VERSION = "coach-v1";

/** How many separate conversations must show a pattern before we draft for it. */
export const MIN_EVIDENCE = 4;

/** Outcomes that mean the conversation did not go the way we wanted. */
const POOR_OUTCOMES = new Set(["no_reply", "not_interested", "opted_out", "wrong_person", "hostile"]);

export type CoachConversation = {
  threadKey: string;
  outcome: string;
  objectionCategory: string | null;
  sentiment: string | null;
  /** Inbound message bodies, oldest first. */
  inbound: string[];
  /** True when we sent at least one message and the lead never answered. */
  noReply: boolean;
};

export type CoachProfileState = {
  id: string;
  name: string;
  opener: string;
  objections: Array<{ trigger: string; approved_response: string }>;
  faqs: Array<{ q: string; a: string }>;
  escalationTriggers: string[];
};

export type CoachDraft = {
  /** Which field of the profile this edit lands on. */
  field: "objections" | "faqs" | "escalation_triggers" | "opener";
  /** Human-readable name for the drafted change, shown on the proposal card. */
  title: string;
  /** Plain-language reason, with the numbers in it. */
  rationale: string;
  /** The complete new value for the field, so approval is a single write. */
  value: unknown;
  /** The value we read, so the approver can diff. */
  current: unknown;
  /** Thread keys behind the draft. */
  evidence: string[];
};

/** Objection categories the Labeler records, and the wording we draft for each. */
const OBJECTION_DRAFTS: Record<string, { trigger: string; response: string; label: string }> = {
  price: {
    trigger: "that offer is too low",
    response:
      "Totally fair — the number depends on the condition and what's owed. If you tell me roughly what shape it's in, I'll get you a real figure rather than a guess.",
    label: "Price Pushback",
  },
  timing: {
    trigger: "not right now",
    response:
      "Understood. Is it a not-yet or a not-ever? If there's a date you're working toward, I'll follow up closer to it instead of bothering you now.",
    label: "Bad Timing",
  },
  trust: {
    trigger: "who are you / is this a scam",
    response:
      "Fair question. I'll tell you exactly who I am and where the information came from, and if you'd rather talk to a person I'll have someone call you.",
    label: "Trust And Identity",
  },
  already_listed: {
    trigger: "it's already listed with an agent",
    response:
      "Got it — I won't get between you and your agent. If it comes off the market and you still want options, I'm happy to pick this back up then.",
    label: "Already Listed",
  },
  not_owner: {
    trigger: "this isn't my property",
    response:
      "Apologies for the mix-up — I'll take this number off the list for that address. Thanks for telling me.",
    label: "Wrong Owner",
  },
  wrong_number: {
    trigger: "wrong number",
    response: "Sorry about that — I'll remove this number. Thanks for letting me know.",
    label: "Wrong Number",
  },
  condition: {
    trigger: "the place needs too much work",
    response:
      "That's usually fine on our end — the condition mostly changes the number, not whether it's workable. What are the big items?",
    label: "Property Condition",
  },
};

/** Question shapes worth a standing answer once they keep recurring. */
const FAQ_PATTERNS: Array<{ key: string; test: RegExp; q: string; a: string }> = [
  {
    key: "where_got_info",
    test: /(where|how) (did|d) ?you get (my|this)|how did you (find|get)/i,
    q: "Where did you get my number?",
    a: "From public county records tied to the property, not from anything you filled in. If you'd rather not hear from us, say STOP and that's the end of it.",
  },
  {
    key: "are_you_agent",
    test: /are you (a|an) (agent|realtor|broker)|do you charge|commission/i,
    q: "Are you an agent, and does this cost me anything?",
    a: "No commission and no fee on our side. If you want an agent instead, that's a completely reasonable route and I'll say so.",
  },
  {
    key: "how_much",
    test: /how much (will|would|can) you (pay|offer)|what('s| is) your offer/i,
    q: "How much would you pay?",
    a: "I can't put a real number on it without knowing the condition and what's owed. Give me those two and I'll come back with a figure, not a range.",
  },
  {
    key: "how_fast",
    test: /how (fast|quickly|soon)|when could (you|we) close/i,
    q: "How fast could this close?",
    a: "Usually a few weeks once we've seen it, and we can work to a date if you have one. I won't promise a timeline I haven't checked.",
  },
  {
    key: "is_this_real",
    test: /is this (a )?(scam|real|legit)|bot\b|am i talking to a (robot|bot|person)/i,
    q: "Is this real, and am I talking to a person?",
    a: "It starts as an automated message and a real person takes over as soon as there's anything to discuss. Happy to have them call you now if you prefer.",
  },
];

/** Inbound lines that should have pulled a human in and may not have. */
const ESCALATION_PATTERNS: Array<{ key: string; test: RegExp; phrase: string }> = [
  { key: "lawyer", test: /\b(lawyer|attorney|legal action|sue)\b/i, phrase: "lawyer" },
  { key: "bankruptcy", test: /\bbankrupt(cy)?\b|chapter (7|13)/i, phrase: "bankruptcy" },
  { key: "death", test: /\b(passed away|deceased|died|funeral)\b/i, phrase: "passed away" },
  { key: "hardship", test: /\b(cancer|hospice|hospital|disabled|evicted)\b/i, phrase: "hospice" },
  { key: "call_me", test: /\b(call me|give me a call|phone me)\b/i, phrase: "call me" },
];

function has(hay: string[], needle: string): boolean {
  const n = needle.trim().toLowerCase();
  return hay.some((h) => h.trim().toLowerCase().includes(n) || n.includes(h.trim().toLowerCase()));
}

function firstSentences(text: string, count: number): string {
  const parts = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  return parts.slice(0, count).join(" ").trim();
}

/**
 * Drafts the edits this profile's own transcripts justify. Returns an empty
 * list when the history is too thin — "nothing to say yet" is a real answer.
 */
export function draftCoachEdits(
  profile: CoachProfileState,
  conversations: CoachConversation[],
): CoachDraft[] {
  const drafts: CoachDraft[] = [];
  if (conversations.length === 0) return drafts;

  // ---- 1. Objections the bot keeps meeting with no approved answer ---------
  const byObjection = new Map<string, string[]>();
  for (const c of conversations) {
    const key = c.objectionCategory;
    if (!key || !OBJECTION_DRAFTS[key]) continue;
    byObjection.set(key, [...(byObjection.get(key) ?? []), c.threadKey]);
  }
  const existingTriggers = profile.objections.map((o) => o.trigger ?? "");
  for (const [key, threads] of byObjection) {
    if (threads.length < MIN_EVIDENCE) continue;
    const draft = OBJECTION_DRAFTS[key]!;
    if (has(existingTriggers, draft.trigger)) continue;
    drafts.push({
      field: "objections",
      title: `Add An Approved Answer For ${draft.label}`,
      rationale: `${threads.length} conversations ran into "${draft.label.toLowerCase()}" and this profile has no approved answer for it, so the bot improvised or handed off. This adds one answer and changes nothing else.`,
      current: profile.objections,
      value: [...profile.objections, { trigger: draft.trigger, approved_response: draft.response }],
      evidence: threads.slice(0, 12),
    });
  }

  // ---- 2. Questions asked often enough to deserve a standing answer -------
  const existingQuestions = profile.faqs.map((f) => f.q);
  for (const pattern of FAQ_PATTERNS) {
    const threads = conversations
      .filter((c) => c.inbound.some((b) => pattern.test.test(b)))
      .map((c) => c.threadKey);
    if (threads.length < MIN_EVIDENCE) continue;
    if (has(existingQuestions, pattern.q)) continue;
    drafts.push({
      field: "faqs",
      title: `Add A Standing Answer: "${pattern.q}"`,
      rationale: `People asked this in ${threads.length} conversations and there is no approved answer, which means the bot was answering from nothing. This adds the answer only.`,
      current: profile.faqs,
      value: [...profile.faqs, { q: pattern.q, a: pattern.a }],
      evidence: threads.slice(0, 12),
    });
  }

  // ---- 3. Moments that should have pulled a person in ---------------------
  for (const pattern of ESCALATION_PATTERNS) {
    const threads = conversations
      .filter((c) => c.inbound.some((b) => pattern.test.test(b)))
      .map((c) => c.threadKey);
    if (threads.length < MIN_EVIDENCE) continue;
    if (has(profile.escalationTriggers, pattern.phrase)) continue;
    drafts.push({
      field: "escalation_triggers",
      title: `Hand Off When Someone Says "${pattern.phrase}"`,
      rationale: `${threads.length} conversations contained this and the profile does not hand off on it. Adding it makes the bot more cautious, never less.`,
      current: profile.escalationTriggers,
      value: [...profile.escalationTriggers, pattern.phrase],
      evidence: threads.slice(0, 12),
    });
  }

  // ---- 4. An opener that is not earning replies ---------------------------
  const openerSample = conversations.length;
  const poor = conversations.filter((c) => c.noReply || POOR_OUTCOMES.has(c.outcome)).length;
  const trimmed = firstSentences(profile.opener, 2);
  if (
    openerSample >= 20 &&
    poor / openerSample >= 0.7 &&
    profile.opener.length > 220 &&
    trimmed.length > 0 &&
    trimmed !== profile.opener.trim()
  ) {
    const value = trimmed.endsWith("?") ? trimmed : `${trimmed} Is that something you'd consider?`;
    drafts.push({
      field: "opener",
      title: "Shorten The Opener To Its First Two Sentences",
      rationale: `${poor} of ${openerSample} conversations on this profile ended with no reply or a flat no, and the opener runs ${profile.opener.length} characters. This is the same message cut to its first two sentences with one clear question — read it before approving, because this is the line a stranger sees first.`,
      current: profile.opener,
      value,
      evidence: conversations.slice(0, 12).map((c) => c.threadKey),
    });
  }

  return drafts;
}