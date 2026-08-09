/**
 * The "money moment" on the results page: what launching this list will
 * actually reach and cost. Rates follow the pricing model (flat SMS per
 * segment, never multiplied by tier).
 */
/**
 * Fallback per-segment rate (the Free/Starter price). Paid tiers send their
 * own plan rate in, so a Growth or Scale workspace is never quoted the
 * entry-level price it does not pay.
 */
export const SMS_RATE_PER_SEGMENT = 0.012;

/** Default drip sequence length used for the pre-launch estimate. */
export const DEFAULT_SEQUENCE_STEPS = 4;

/**
 * GSM-7 segmentation: a single message fits 160 characters; anything longer is
 * concatenated and each part carries a 7-char UDH header, leaving 153 chars.
 */
export function estimateSegments(text: string): number {
  const len = text?.length ?? 0;
  if (len <= 0) return 1;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

export type LaunchEstimate = {
  reach: number;
  steps: number;
  /** Messages (one per lead per step). */
  messages: number;
  /** Billable segments across the whole sequence. */
  segments: number;
  cost: number;
  /** Average segments per message used for the quote. */
  segmentsPerMessage: number;
  /** True when no real templates existed and we assumed 1 segment/message. */
  assumed: boolean;
  /** Per-segment rate used for this quote. */
  ratePerSegment: number;
};

/**
 * Cost of launching a list. When the workspace already has campaign templates
 * for this list, we bill real segment counts per step; otherwise we fall back
 * to a 1-segment assumption which the UI must label as a "from" price.
 */
export function launchEstimate(
  cleanLeads: number,
  opts?: { steps?: number; templates?: string[]; ratePerSegment?: number },
): LaunchEstimate {
  const rate = opts?.ratePerSegment ?? SMS_RATE_PER_SEGMENT;
  const reach = Math.max(0, Math.round(cleanLeads));
  const templates = (opts?.templates ?? []).filter((t) => typeof t === "string" && t.trim().length > 0);
  const steps = templates.length > 0 ? templates.length : (opts?.steps ?? DEFAULT_SEQUENCE_STEPS);
  const messages = reach * steps;
  const segmentsPerStep = templates.length > 0 ? templates.map(estimateSegments) : Array(steps).fill(1);
  const segmentsPerSequence = segmentsPerStep.reduce((a, b) => a + b, 0);
  const segments = reach * segmentsPerSequence;
  return {
    reach,
    steps,
    messages,
    segments,
    cost: segments * rate,
    segmentsPerMessage: steps > 0 ? segmentsPerSequence / steps : 1,
    assumed: templates.length === 0,
    ratePerSegment: rate,
  };
}

export function formatUsd(amount: number) {
  return amount < 1 && amount > 0
    ? `$${amount.toFixed(2)}`
    : amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}