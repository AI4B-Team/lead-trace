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
  /**
   * P5.8.7 — multi-line correction. Lines (rows) that belong to the same
   * contact as this one, so the Scout nominates a person once and can see that
   * one of their numbers has never been tried.
   */
  contactKey?: string | null;
  /** How many lines we hold for this contact, including this one. */
  contactLines?: number;
  /** Outbound touches across every line of the contact. */
  contactTouches?: number;
  /** True when ANY line of this contact opted out or is suppressed. */
  contactOptedOut?: boolean;
};

export type Nomination = {
  leadId: string;
  score: number;
  reasons: string[];
  /** Named signals that fired, so the Scorer can learn from real outcomes. */
  signals: SignalKey[];
};

/**
 * Every point a lead earns is attributable to one named signal. The Hot-Lead
 * Scorer refits these weights against what this workspace has actually
 * converted; the defaults are what a new workspace starts from.
 */
export const SIGNAL_KEYS = [
  "anchor_imminent",
  "anchor_soon",
  "anchor_dated",
  "never_touched",
  "lightly_touched",
  "heavily_touched",
  "gone_cold",
  "quiet_unrevisited",
  "price_question",
  "objection_open",
  "unresolved",
  "multi_record_type",
  "multi_source",
  "multi_list",
  "mobile_verified",
  "freshly_added",
  "untried_line",
] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];
export type SignalWeights = Record<SignalKey, number>;

export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  anchor_imminent: 30,
  anchor_soon: 18,
  anchor_dated: 6,
  never_touched: 22,
  lightly_touched: 10,
  heavily_touched: -12,
  gone_cold: 14,
  quiet_unrevisited: 12,
  price_question: 16,
  objection_open: 8,
  unresolved: 4,
  multi_record_type: 10,
  multi_source: 6,
  multi_list: 4,
  mobile_verified: 6,
  freshly_added: 5,
  untried_line: 9,
};

export const SIGNAL_LABEL: Record<SignalKey, string> = {
  anchor_imminent: "Key Date Within Two Weeks",
  anchor_soon: "Key Date Within Six Weeks",
  anchor_dated: "Has A Dated Event",
  never_touched: "Never Contacted",
  lightly_touched: "Barely Touched",
  heavily_touched: "Heavily Worked",
  gone_cold: "Gone Cold",
  quiet_unrevisited: "Went Quiet, Never Revisited",
  price_question: "Ended On A Price Question",
  objection_open: "Objection Left Unanswered",
  unresolved: "Prior Thread Unresolved",
  multi_record_type: "Multiple Record Types",
  multi_source: "Confirmed By Multiple Sources",
  multi_list: "Seen On Several Lists",
  mobile_verified: "Verified Mobile Number",
  freshly_added: "Added This Week",
  untried_line: "Another Number Never Tried",
};

/** Fills any missing key from the defaults so a partial saved fit is safe. */
export function normaliseWeights(input: unknown): SignalWeights {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SIGNAL_WEIGHTS };
  for (const key of SIGNAL_KEYS) {
    const v = Number(raw[key]);
    if (Number.isFinite(v)) out[key] = v;
  }
  return out;
}

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
  // The contact said stop somewhere — every line of theirs is closed, forever.
  if (lead.contactOptedOut) return "contact opted out on another line";
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
export function scoreLead(
  lead: ScoutLead,
  now = Date.now(),
  weights: SignalWeights = DEFAULT_SIGNAL_WEIGHTS,
): Nomination {
  const reasons: string[] = [];
  const signals: SignalKey[] = [];
  let score = 0;
  const add = (key: SignalKey, reason: string) => {
    score += weights[key];
    signals.push(key);
    reasons.push(reason);
  };

  const anchor = lead.anchorDaysRemaining;
  if (anchor !== null && anchor >= 0) {
    if (anchor <= 14) {
      add("anchor_imminent", `Key date is ${anchor} day${anchor === 1 ? "" : "s"} away`);
    } else if (anchor <= 45) {
      add("anchor_soon", `Key date is ${anchor} days away`);
    } else {
      add("anchor_dated", "Has a dated event on file");
    }
  }

  if (lead.touches === 0) {
    add("never_touched", "Never been contacted");
  } else if (lead.touches <= 2) {
    add("lightly_touched", `Only ${lead.touches} touch${lead.touches === 1 ? "" : "es"} so far`);
  } else if (lead.touches >= 6) {
    add("heavily_touched", `${lead.touches} touches already — worked hard`);
  }

  const sinceTouch = daysSince(lead.lastTouchedAt, now);
  if (lead.touches > 0 && sinceTouch !== null && sinceTouch >= 30) {
    add("gone_cold", `Gone cold for ${sinceTouch} days`);
  }

  if (lead.lastOutcome === "went_quiet" && sinceTouch !== null && sinceTouch >= 21) {
    add("quiet_unrevisited", "Went quiet a while back and was never revisited");
  }
  if (lead.lastOutcome === "price_question") {
    add("price_question", "Last conversation ended on a price question");
  }
  if (lead.lastOutcome === "objection_raised") {
    add("objection_open", "Raised an objection that was never answered");
  }
  if (lead.lastOutcome === "unclear") {
    add("unresolved", "Prior thread was never resolved either way");
  }

  if (lead.recordTypes.length > 1) {
    add("multi_record_type", `Appears under ${lead.recordTypes.length} record types`);
  }
  if (lead.sourceTypes.length > 1) {
    add("multi_source", `Confirmed by ${lead.sourceTypes.length} sources`);
  }
  if (lead.listCount > 2) {
    add("multi_list", `Showed up on ${lead.listCount} lists`);
  }
  if (lead.phoneType && ["mobile", "wireless"].includes(lead.phoneType.toLowerCase())) {
    add("mobile_verified", "Verified mobile number");
  }

  const age = daysSince(lead.firstSeenAt, now);
  if (age !== null && age <= 7) {
    add("freshly_added", "Added within the last week");
  }

  if ((lead.contactLines ?? 1) > 1 && lead.touches === 0 && (lead.contactTouches ?? 0) > 0) {
    add("untried_line", "We have another number for this contact that has never been tried");
  }

  if (reasons.length === 0) reasons.push("Untouched and unworked, nothing against it");
  return { leadId: lead.id, score: Math.round(score), reasons, signals };
}

/** Ranks eligible leads and returns the top `limit`, highest score first. */
export function nominateLeads(
  leads: ScoutLead[],
  limit: number,
  now = Date.now(),
  weights: SignalWeights = DEFAULT_SIGNAL_WEIGHTS,
): { nominations: Nomination[]; skipped: Record<string, number> } {
  const skipped: Record<string, number> = {};
  const scored: Nomination[] = [];
  for (const lead of leads) {
    const reason = ineligibleReason(lead, now);
    if (reason) {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
      continue;
    }
    scored.push(scoreLead(lead, now, weights));
  }
  scored.sort((a, b) => b.score - a.score || a.leadId.localeCompare(b.leadId));
  // One nomination per contact: the same person held under two record types is
  // one person to call, and the best line wins.
  const contactOf = new Map(leads.map((l) => [l.id, l.contactKey ?? `line:${l.id}`]));
  const seen = new Set<string>();
  const unique: Nomination[] = [];
  for (const nom of scored) {
    const key = contactOf.get(nom.leadId) ?? nom.leadId;
    if (seen.has(key)) {
      skipped["another line of the same contact ranked higher"] =
        (skipped["another line of the same contact ranked higher"] ?? 0) + 1;
      continue;
    }
    seen.add(key);
    unique.push(nom);
  }
  return { nominations: unique.slice(0, limit), skipped };
}