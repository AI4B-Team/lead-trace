/**
 * Pure classification for the Conversation Labeler. Deterministic on purpose:
 * an outcome store that trains every other agent has to be reproducible, and a
 * low-confidence thread is recorded as 'unclear' rather than guessed into a
 * category to avoid a blank.
 */

export const LABELER_VERSION = "labeler-v1";

export type Outcome =
  | "booked"
  | "objection_raised"
  | "price_question"
  | "went_quiet"
  | "wrong_number"
  | "not_owner"
  | "opted_out"
  | "hostile"
  | "disposition_detected"
  | "handed_off"
  | "converted"
  | "unclear";

export type Sentiment = "positive" | "neutral" | "negative" | "distressed";

/** Seed set. New categories are recorded as-is and surfaced for naming. */
export const SEED_OBJECTIONS = [
  "already_working_with_lender",
  "loan_mod_in_place",
  "not_selling",
  "listed_with_agent",
  "price_too_low",
  "distrusts_sender",
  "wants_proof_of_identity",
  "family_decision",
  "timing_not_now",
] as const;

const OBJECTION_PATTERNS: Array<[string, RegExp]> = [
  ["already_working_with_lender", /(working with (my|the) (lender|bank)|talking to (my|the) (lender|bank)|in touch with the bank)/i],
  ["loan_mod_in_place", /(loan mod|modification|forbearance|repayment plan|reinstat)/i],
  ["listed_with_agent", /(listed with|my (realtor|agent)|already have an agent|on the market)/i],
  ["price_too_low", /(too low|lowball|insult|worth (a lot |way )?more|not enough money)/i],
  ["distrusts_sender", /(scam|who is this|how did you get|spam|fraud|don'?t trust)/i],
  ["wants_proof_of_identity", /(are you licensed|proof|credentials|company name|website|verify who)/i],
  ["family_decision", /(my (wife|husband|spouse|brother|sister|mother|father|family)|siblings|the estate|talk it over)/i],
  ["timing_not_now", /(not right now|later this year|call me in|next month|too soon|maybe later|bad time)/i],
  ["not_selling", /(not selling|no interest in selling|keeping (the|my) (house|home)|not for sale|staying put)/i],
];

const BOOKED = /(see you|that works|book(ed)? (me|it)? ?(in|for)?|confirmed for|appointment|let'?s do|works for me|come by at|meet (you|at))/i;
const PRICE = /(how much|what (are|is) you(r)? (offer|paying)|price|offer|cash offer|ballpark|what would you pay)/i;
const WRONG_NUMBER = /(wrong number|not my (house|number)|you have the wrong)/i;
const NOT_OWNER = /(i (don'?t|do not) own|i(’|')?m (just )?(the )?(tenant|renter)|not the owner|sold (it|the house) (years|last))/i;
const HOSTILE = /(f\W?u\b|fuck|lawyer|sue you|harass|report you|leave me alone|piss off|asshole)/i;
const DISTRESSED = /(losing (my|the) (house|home)|can'?t afford|no money|passed away|died|funeral|sick|cancer|hospital|divorce|lost my job|homeless|scared|desperate|please help)/i;
const POSITIVE = /(thank(s| you)|great|sounds good|appreciate|yes|interested|please do|ok(ay)?)/i;
const NEGATIVE = /(no thanks|not interested|stop contacting|don'?t contact|remove me|no)/i;
const CONVERTED = /(under contract|signed|closing|we have a deal|accepted your offer)/i;

export type LabelInput = {
  messages: Array<{ direction: string; body: string | null; is_optout?: boolean | null; created_at: string }>;
  sequenceStatus?: string | null;
  disposition?: string | null;
  handoffReason?: string | null;
  appointmentBooked?: boolean;
  anchorDate?: string | null;
  outcomeAt?: string | null;
};

export type Label = {
  outcome: Outcome;
  objectionCategory: string | null;
  sentiment: Sentiment;
  touchesBeforeOutcome: number;
  anchorDaysRemaining: number | null;
  confidence: number;
  flagged: boolean;
};

function detectObjection(text: string): string | null {
  for (const [key, re] of OBJECTION_PATTERNS) if (re.test(text)) return key;
  return null;
}

export function daysBetween(anchor: string | null | undefined, at: string | null | undefined): number | null {
  if (!anchor) return null;
  const a = new Date(anchor).getTime();
  const b = new Date(at ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export function classifyThread(input: LabelInput): Label {
  const inbound = input.messages.filter((m) => m.direction === "inbound");
  const outboundBefore = input.messages.filter((m) => m.direction === "outbound").length;
  const inboundText = inbound.map((m) => m.body ?? "").join("\n");
  const lastAt = input.outcomeAt ?? input.messages.at(-1)?.created_at ?? null;
  const anchorDaysRemaining = daysBetween(input.anchorDate, lastAt);

  // Sentiment first — 'distressed' is its own value, never a synonym for negative.
  const sentiment: Sentiment = DISTRESSED.test(inboundText)
    ? "distressed"
    : HOSTILE.test(inboundText) || NEGATIVE.test(inboundText)
      ? "negative"
      : POSITIVE.test(inboundText)
        ? "positive"
        : "neutral";

  const base = {
    objectionCategory: null as string | null,
    sentiment,
    touchesBeforeOutcome: outboundBefore,
    anchorDaysRemaining,
  };
  const done = (outcome: Outcome, confidence: number, extra: Partial<Label> = {}): Label => ({
    ...base,
    outcome,
    confidence,
    flagged: outcome === "unclear" || sentiment === "distressed",
    ...extra,
  });

  if (input.messages.some((m) => m.is_optout) || input.sequenceStatus === "opted_out") {
    return done("opted_out", 1);
  }
  if (input.sequenceStatus === "converted" || CONVERTED.test(inboundText)) return done("converted", 0.8);
  if (input.appointmentBooked) return done("booked", 1);
  if (input.disposition) return done("disposition_detected", 0.9);
  if (input.handoffReason || input.sequenceStatus === "paused_human") return done("handed_off", 0.9);

  if (inbound.length === 0) return done("went_quiet", 0.9);

  if (WRONG_NUMBER.test(inboundText)) return done("wrong_number", 0.9);
  if (NOT_OWNER.test(inboundText)) return done("not_owner", 0.85);
  if (HOSTILE.test(inboundText)) return done("hostile", 0.85);
  if (BOOKED.test(inboundText)) return done("booked", 0.7);

  const objection = detectObjection(inboundText);
  if (objection) return done("objection_raised", 0.75, { objectionCategory: objection });
  if (PRICE.test(inboundText)) return done("price_question", 0.8);

  // Replied, but nothing we can honestly categorise.
  return done("unclear", 0.3);
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  booked: "Booked",
  objection_raised: "Objection Raised",
  price_question: "Price Question",
  went_quiet: "Went Quiet",
  wrong_number: "Wrong Number",
  not_owner: "Not The Owner",
  opted_out: "Opted Out",
  hostile: "Hostile",
  disposition_detected: "Disposition Detected",
  handed_off: "Handed Off",
  converted: "Converted",
  unclear: "Unclear",
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  distressed: "Distressed",
};

/** "already_working_with_lender" → "Already Working With Lender" */
export function objectionLabel(key: string): string {
  return key
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}