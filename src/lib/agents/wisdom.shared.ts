/**
 * P5.8.6 — the Wisdom Miner. Proposals only, permanently.
 *
 * When a person takes a conversation over from the bot, whatever they typed is
 * the best available answer to whatever was just asked — it is the wording a
 * human chose, under pressure, with the whole thread in front of them. The Miner
 * captures those moments and offers them back as approved wording.
 *
 * Because that wording is lifted verbatim from a live conversation, the risky
 * part is not the drafting, it is the copying: a one-off reply can contain a
 * specific person's details or a promise made about one property. Everything
 * that looks personal or situational is dropped here rather than filtered later.
 *
 * Pure module: no IO, so every rejection rule is directly testable.
 */

export const WISDOM_VERSION = "wisdom-v1";

/** A human reply more than this long after the question is answering something else. */
const MAX_ANSWER_GAP_HOURS = 24;

/** Outcomes that disqualify a takeover from being treated as a good example. */
const BAD_OUTCOMES = new Set(["opted_out", "hostile", "wrong_person", "complaint"]);

export type TakeoverMoment = {
  threadKey: string;
  /** What the person asked, verbatim. */
  question: string;
  /** What the human operator sent back, verbatim. */
  humanReply: string;
  /** Hours between the two. */
  gapHours: number;
  /** Recorded outcome for the thread, when the Labeler has seen it. */
  outcome: string | null;
  sentiment: string | null;
};

export type WisdomProfileState = {
  id: string;
  name: string;
  objections: Array<{ trigger: string; approved_response: string }>;
  faqs: Array<{ q: string; a: string }>;
};

export type WisdomDraft = {
  field: "objections";
  title: string;
  rationale: string;
  value: Array<{ trigger: string; approved_response: string }>;
  current: Array<{ trigger: string; approved_response: string }>;
  evidence: string[];
  /** Kept for the review card: the exact pair a person is approving. */
  captured: { trigger: string; approved_response: string };
};

/** Anything here means the reply was about one person, not about the situation. */
const PERSONAL_PATTERNS: RegExp[] = [
  /\b\d{3}[-. ]?\d{3}[-. ]?\d{4}\b/, // phone number
  /\d{7,}/, // long digit runs: account, case, parcel
  /[\w.+-]+@[\w-]+\.[\w.]+/, // email
  /https?:\/\/|www\./i, // link
  /\$\s?\d/, // a specific dollar figure
  /\b\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court)\b/i, // street address
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, // a specific appointment
  /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i, // a specific time
  /\b(i'?ll|we'?ll) (be there|come by|swing by|stop by)\b/i, // a personal commitment
];

/** Replies that carry no reusable wording. */
function tooThin(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return true;
  const words = t.split(/\s+/).length;
  return words < 8;
}

export type RejectionReason =
  | "bad_outcome"
  | "answered_too_late"
  | "too_thin"
  | "too_long"
  | "personal_detail"
  | "no_question";

/**
 * Why a captured moment can't become approved wording, or null when it can.
 * Named reasons so a run summary can say what it threw away and why.
 */
export function rejectionReason(moment: TakeoverMoment): RejectionReason | null {
  if (moment.outcome && BAD_OUTCOMES.has(moment.outcome)) return "bad_outcome";
  if (moment.gapHours > MAX_ANSWER_GAP_HOURS) return "answered_too_late";
  if (!moment.question.trim()) return "no_question";
  if (tooThin(moment.humanReply)) return "too_thin";
  if (moment.humanReply.length > 600) return "too_long";
  if (PERSONAL_PATTERNS.some((re) => re.test(moment.humanReply))) return "personal_detail";
  return null;
}

/** Short, quoted form of the question, used as the objection trigger. */
export function triggerFrom(question: string): string {
  const one = question.replace(/\s+/g, " ").trim();
  return one.length <= 120 ? one : `${one.slice(0, 117)}…`;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function alreadyCovered(state: WisdomProfileState, trigger: string, reply: string): boolean {
  const t = normalise(trigger);
  const r = normalise(reply);
  for (const o of state.objections) {
    if (normalise(o.trigger ?? "") === t) return true;
    if (normalise(o.approved_response ?? "") === r) return true;
  }
  return state.faqs.some((f) => normalise(f.q) === t);
}

/**
 * Turns captured takeovers into proposals. One draft per distinct question
 * shape; when a person answered the same thing several times we keep the
 * longest reply, because that is the one that explained itself.
 */
export function draftWisdom(
  state: WisdomProfileState,
  moments: TakeoverMoment[],
): { drafts: WisdomDraft[]; rejected: Record<string, number> } {
  const rejected: Record<string, number> = {};
  const keep = new Map<string, TakeoverMoment[]>();

  for (const m of moments) {
    const reason = rejectionReason(m);
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1;
      continue;
    }
    const key = normalise(m.question).split(" ").slice(0, 8).join(" ");
    keep.set(key, [...(keep.get(key) ?? []), m]);
  }

  const drafts: WisdomDraft[] = [];
  // Newest state first: each draft is a full replacement value for the field,
  // so they are built against the same starting list and approved one at a time.
  for (const [, group] of keep) {
    const best = [...group].sort((a, b) => b.humanReply.length - a.humanReply.length)[0]!;
    const trigger = triggerFrom(best.question);
    if (alreadyCovered(state, trigger, best.humanReply)) continue;
    const times = group.length;
    drafts.push({
      field: "objections",
      title: `Keep What Your Team Said To "${trigger}"`,
      rationale:
        `A person took this conversation over and answered in their own words` +
        (times > 1 ? ` — and answered the same question ${times} times across your threads.` : ".") +
        ` This proposes keeping their exact wording as an approved answer so the bot stops improvising here. Nothing existing is removed.`,
      current: state.objections,
      value: [...state.objections, { trigger, approved_response: best.humanReply.trim() }],
      evidence: group.map((g) => g.threadKey).slice(0, 12),
      captured: { trigger, approved_response: best.humanReply.trim() },
    });
  }

  return { drafts, rejected };
}