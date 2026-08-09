/**
 * P5.8.4 — the Booking Auditor.
 *
 * A booking is the only thing in this product that puts a person in a car. So
 * the question is narrow: does the thread actually contain a confirmed time the
 * lead agreed to, or did the bot decide a meeting existed?
 *
 * Every finding is a flag for a human, never an edit. The auditor does not
 * cancel, reschedule, or reword anything.
 *
 * Pure module: no IO, so every rule is directly testable.
 */

export const BOOKING_AUDITOR_VERSION = "booking-auditor-v1";

export type AuditMessage = {
  direction: string;
  body: string | null;
  is_bot: boolean;
  created_at: string;
};

export type BookingThread = {
  threadKey: string;
  leadId: string | null;
  /** When the thread was marked as an appointment. */
  markedAt: string | null;
  messages: AuditMessage[];
};

export type BookingIssue =
  | "no_lead_confirmation"
  | "no_time_agreed"
  | "time_mismatch"
  | "cancelled_after_booking"
  | "bot_assumed_yes"
  | "stale_no_confirmation";

export type BookingFinding = {
  threadKey: string;
  leadId: string | null;
  issues: BookingIssue[];
  /** Plain-language sentence per issue, in the same order. */
  reasons: string[];
  /** The time the lead named, when we could find one. */
  leadTime: string | null;
  /** The time the bot named, when we could find one. */
  botTime: string | null;
  evidence: string[];
};

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i;
const DAY_RE =
  /\b(today|tomorrow|mon(day)?|tues(day)?|tue|wed(nesday)?|thurs(day)?|thur|thu|fri(day)?|sat(urday)?|sun(day)?)\b/i;

/** Lead wording that counts as agreeing to a meeting. */
const CONFIRM_RE =
  /\b(that works|works for me|sounds good|see you( then| at)?|i'?ll be (there|home)|yes,? ?(that|let'?s)|let'?s do|ok(ay)? (then|see)|confirmed|i can do|i'?m free|come (by|on) (over|by|at)?)\b/i;
/** Lead wording that unbooks it, whatever the bot recorded. */
const CANCEL_RE =
  /\b(can'?t make it|cannot make it|need to (reschedule|move)|reschedule|something came up|not going to work|cancel|won'?t be (home|there)|another time|change of plans)\b/i;
/** A question is not a confirmation, even when it names a time. */
const QUESTION_RE = /\?\s*$/;

function normaliseTime(text: string): string | null {
  const m = TIME_RE.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  const minute = m[2] ?? "00";
  return `${hour}:${minute}${m[3]!.toLowerCase()}`;
}

function normaliseDay(text: string): string | null {
  const m = DAY_RE.exec(text);
  if (!m) return null;
  const raw = m[1]!.toLowerCase();
  const map: Record<string, string> = {
    mon: "monday", tue: "tuesday", tues: "tuesday", wed: "wednesday",
    thu: "thursday", thur: "thursday", thurs: "thursday", fri: "friday",
    sat: "saturday", sun: "sunday",
  };
  return map[raw] ?? raw;
}

function slot(text: string): string | null {
  const time = normaliseTime(text);
  const day = normaliseDay(text);
  if (!time && !day) return null;
  return [day, time].filter(Boolean).join(" ");
}

/** A booking is stale when nobody confirmed and this long has passed. */
const STALE_HOURS = 48;

/**
 * Audits one thread that is currently marked as an appointment.
 * Returns null when the booking holds up.
 */
export function auditBooking(thread: BookingThread, now = Date.now()): BookingFinding | null {
  const ordered = [...thread.messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const inbound = ordered.filter((m) => m.direction === "inbound" && m.body?.trim());
  const outbound = ordered.filter((m) => m.direction === "outbound" && m.body?.trim());

  const issues: BookingIssue[] = [];
  const reasons: string[] = [];
  const add = (issue: BookingIssue, reason: string) => {
    issues.push(issue);
    reasons.push(reason);
  };

  // What time did each side name? The lead's last named slot is what they agreed
  // to; the bot's last named slot is what it is acting on.
  let leadTime: string | null = null;
  let botTime: string | null = null;
  for (const m of inbound) {
    const s = slot(m.body!);
    if (s && !QUESTION_RE.test(m.body!.trim())) leadTime = s;
  }
  for (const m of outbound) {
    const s = slot(m.body!);
    if (s) botTime = s;
  }

  const confirmed = inbound.some((m) => CONFIRM_RE.test(m.body!));
  const lastCancelIdx = ordered.findLastIndex(
    (m) => m.direction === "inbound" && !!m.body && CANCEL_RE.test(m.body),
  );
  const lastConfirmIdx = ordered.findLastIndex(
    (m) => m.direction === "inbound" && !!m.body && CONFIRM_RE.test(m.body),
  );

  if (inbound.length === 0) {
    add(
      "no_lead_confirmation",
      "This is marked as an appointment, but the lead never replied at all in this thread.",
    );
  } else if (!confirmed) {
    add(
      "bot_assumed_yes",
      "The lead replied, but never actually agreed to a meeting — no confirmation wording anywhere in the thread.",
    );
  }

  if (!leadTime && !botTime) {
    add("no_time_agreed", "No day or time was ever named by either side, so there is nothing to show up for.");
  } else if (!leadTime && botTime) {
    add(
      "no_time_agreed",
      `Only your side named a time (${botTime}). The lead never repeated or confirmed it.`,
    );
  }

  if (leadTime && botTime && leadTime !== botTime) {
    add(
      "time_mismatch",
      `The lead said ${leadTime} and your side said ${botTime}. One of you is going to be wrong.`,
    );
  }

  if (lastCancelIdx > -1 && lastCancelIdx > lastConfirmIdx) {
    add(
      "cancelled_after_booking",
      "After the booking, the lead said they can't make it or need to move it — this is still marked as set.",
    );
  }

  if (
    !confirmed &&
    thread.markedAt &&
    now - new Date(thread.markedAt).getTime() > STALE_HOURS * 3_600_000
  ) {
    add(
      "stale_no_confirmation",
      `It has been more than ${STALE_HOURS} hours since this was marked as an appointment with no confirmation from the lead.`,
    );
  }

  if (issues.length === 0) return null;

  return {
    threadKey: thread.threadKey,
    leadId: thread.leadId,
    issues,
    reasons,
    leadTime,
    botTime,
    evidence: [thread.threadKey],
  };
}

const SEVERITY: Record<BookingIssue, number> = {
  cancelled_after_booking: 5,
  time_mismatch: 4,
  no_lead_confirmation: 3,
  bot_assumed_yes: 3,
  no_time_agreed: 2,
  stale_no_confirmation: 1,
};

/** Worst issue first, so a review queue reads in the order a person should work it. */
export function rankFindings(findings: BookingFinding[]): BookingFinding[] {
  const weight = (f: BookingFinding) => Math.max(...f.issues.map((i) => SEVERITY[i]));
  return [...findings].sort((a, b) => weight(b) - weight(a));
}

export const BOOKING_ISSUE_LABEL: Record<BookingIssue, string> = {
  no_lead_confirmation: "Lead Never Replied",
  no_time_agreed: "No Time Agreed",
  time_mismatch: "Times Don't Match",
  cancelled_after_booking: "Lead Backed Out",
  bot_assumed_yes: "Bot Assumed A Yes",
  stale_no_confirmation: "Unconfirmed For Days",
};
