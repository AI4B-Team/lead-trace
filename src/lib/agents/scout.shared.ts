/**
 * Pure scoring for the Lead Scout. Deterministic and explainable: every point a
 * lead earns comes back as a plain-language reason, because an operator has to
 * be able to disagree with a nomination for a specific stated cause.
 *
 * The Scout reads the whole book of leads, not the recent end of it. Freshness
 * is a small term on purpose — an old lead that has never been touched beats a
 * new one that was texted yesterday.
 */

export const SCOUT_VERSION = "scout-v1";

export type ScoutLead = {
  id: string;
  fullName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  phoneType: string | null;
  disposition: string;
  recordTypes: string[];
  sourceTypes: string[];
  listCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  /** Last outbound touch of any kind, or null if never touched. */
  lastTouchedAt: string | null;
  touches: number;
  /** True when the lead replied at least once, ever. */
  hasReplied: boolean;
  /** Recorded outcome from the Conversation Labeler, when the thread finished. */
  lastOutcome: string | null;
  /** Sequence status, when the lead sits in a campaign. */
  sequenceStatus: string | null;
  /** Days until the lead's anchor date (auction, sale, hearing), if any. */
  anchorDaysRemaining: number | null;
};

export type Nomination = {
  leadId: string;
  score: number;
  reasons: string[];
};

/** Outcomes that mean "do not nominate this lead again", ever. */
const TERMINAL_OUTCOMES = new Set(["opted_out", "wrong_number", "not_owner", "hostile", "converted"]);
const TERMINAL_DISPOSITIONS = new Set(["opted_out", "dnc", "bad_number", "not_owner", "closed", "won", "lost"]);

const DAY = 86_400_000;

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY);
}

/**
 * Why a lead is out of scope. Returning the reason rather than a boolean keeps
 * the run log honest about what was skipped.
 */
export function ineligibleReason(lead: ScoutLead, now = Date.now()): string | null {
  if (!lead.phone) return "no phone on file";
  if (lead.phoneType && lead.phoneType.toLowerCase() === "landline") return "landline";
  if (TERMINAL_DISPOSITIONS.has(lead.disposition)) return `disposition ${lead.disposition}`;
  if (lead.lastOutcome && TERMINAL_OUTCOMES.has(lead.lastOutcome)) return `outcome ${lead.lastOutcome}`;
  if (lead.sequenceStatus === "active") return "already in an active sequence";
  if (lead.hasReplied && lead.lastOutcome === null) return "live conversation — belongs to a human";
  const since = daysSince(lead.lastTouchedAt, now);
  if (since !== null && since < 4) return "touched in the last few days";
  return null;
}

/**
 * Scores one lead. Deliberately additive and small-integer so the arithmetic is
 * legible in the UI next to the reasons.
 */
export function scoreLead(lead: ScoutLead, now = Date.now()): Nomination {
  const reasons: string[] = [];
  let score = 0;

  const anchor = lead.anchorDaysRemaining;
  if (anchor !== null && anchor >= 0) {
    if (anchor <= 14) {
      score += 30;
      reasons.push(`Key date is ${anchor} day${anchor === 1 ? "" : "s"} away`);
    } else if (anchor <= 45) {
      score += 18;
      reasons.push(`Key date is ${anchor} days away`);
    } else {
      score += 6;
      reasons.push("Has a dated event on file");
    }
  }

  if (lead.touches === 0) {
    score += 22;
    reasons.push("Never been contacted");
  } else if (lead.touches <= 2) {
    score += 10;
    reasons.push(`Only ${lead.touches} touch${lead.touches === 1 ? "" : "es"} so far`);
  } else if (lead.touches >= 6) {
    score -= 12;
    reasons.push(`${lead.touches} touches already — worked hard`);
  }

  const sinceTouch = daysSince(lead.lastTouchedAt, now);
  if (lead.touches > 0 && sinceTouch !== null && sinceTouch >= 30) {
    score += 14;
    reasons.push(`Gone cold for ${sinceTouch} days`);
  }

  if (lead.lastOutcome === "went_quiet" && sinceTouch !== null && sinceTouch >= 21) {
    score += 12;
    reasons.push("Went quiet a while back and was never revisited");
  }
  if (lead.lastOutcome === "price_question") {
    score += 16;
    reasons.push("Last conversation ended on a price question");
  }
  if (lead.lastOutcome === "objection_raised") {
    score += 8;
    reasons.push("Raised an objection that was never answered");
  }
  if (lead.lastOutcome === "unclear") {
    score += 4;
    reasons.push("Prior thread was never resolved either way");
  }

  if (lead.recordTypes.length > 1) {
    score += 10;
    reasons.push(`Appears under ${lead.recordTypes.length} record types`);
  }
  if (lead.sourceTypes.length > 1) {
    score += 6;
    reasons.push(`Confirmed by ${lead.sourceTypes.length} sources`);
  }
  if (lead.listCount > 2) {
    score += 4;
    reasons.push(`Showed up on ${lead.listCount} lists`);
  }
  if (lead.phoneType && ["mobile", "wireless"].includes(lead.phoneType.toLowerCase())) {
    score += 6;
    reasons.push("Verified mobile number");
  }

  const age = daysSince(lead.firstSeenAt, now);
  if (age !== null && age <= 7) {
    score += 5;
    reasons.push("Added within the last week");
  }

  if (reasons.length === 0) reasons.push("Untouched and unworked, nothing against it");
  return { leadId: lead.id, score, reasons };
}

/** Ranks eligible leads and returns the top `limit`, highest score first. */
export function nominateLeads(
  leads: ScoutLead[],
  limit: number,
  now = Date.now(),
): { nominations: Nomination[]; skipped: Record<string, number> } {
  const skipped: Record<string, number> = {};
  const scored: Nomination[] = [];
  for (const lead of leads) {
    const reason = ineligibleReason(lead, now);
    if (reason) {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
      continue;
    }
    scored.push(scoreLead(lead, now));
  }
  scored.sort((a, b) => b.score - a.score || a.leadId.localeCompare(b.leadId));
  return { nominations: scored.slice(0, limit), skipped };
}