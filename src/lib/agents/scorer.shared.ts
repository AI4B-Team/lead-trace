/**
 * P5.8.3 — Hot-Lead Scorer. Pure fitting logic.
 *
 * The Scout's default weights are an opinion. This refits them against what a
 * workspace has actually converted, one named signal at a time, using nothing
 * more exotic than a conversion-rate lift. Simple on purpose: an operator has
 * to be able to read the change and disagree with it.
 *
 * It refuses to fit on thin history rather than inventing confidence.
 */
import {
  DEFAULT_SIGNAL_WEIGHTS,
  SIGNAL_KEYS,
  SIGNAL_LABEL,
  type SignalKey,
  type SignalWeights,
} from "./scout.shared";

export const SCORER_VERSION = "scorer-v1";

/** Below these, we say "not enough history" instead of guessing. */
export const MIN_SAMPLES = 40;
export const MIN_CONVERSIONS = 5;
export const MIN_SIGNAL_SAMPLES = 12;

/** A signal can move to at most half or double its default pull. */
const MIN_LIFT = 0.5;
const MAX_LIFT = 2;

export type FitSample = { signals: SignalKey[]; converted: boolean };

export type WeightChange = {
  key: SignalKey;
  label: string;
  from: number;
  to: number;
  samples: number;
  conversionRate: number;
  lift: number;
};

export type FitResult = {
  status: "fitted" | "insufficient";
  weights: SignalWeights;
  changes: WeightChange[];
  samples: number;
  conversions: number;
  baselineRate: number;
  note: string;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function fitSignalWeights(
  samples: FitSample[],
  base: SignalWeights = DEFAULT_SIGNAL_WEIGHTS,
): FitResult {
  const total = samples.length;
  const conversions = samples.filter((s) => s.converted).length;
  const baselineRate = total > 0 ? conversions / total : 0;

  if (total < MIN_SAMPLES || conversions < MIN_CONVERSIONS) {
    return {
      status: "insufficient",
      weights: { ...base },
      changes: [],
      samples: total,
      conversions,
      baselineRate,
      note: `Only ${total} finished conversation${total === 1 ? "" : "s"} and ${conversions} conversion${
        conversions === 1 ? "" : "s"
      } on file — not enough to refit yet.`,
    };
  }

  const weights: SignalWeights = { ...base };
  const changes: WeightChange[] = [];

  for (const key of SIGNAL_KEYS) {
    const withSignal = samples.filter((s) => s.signals.includes(key));
    if (withSignal.length < MIN_SIGNAL_SAMPLES) continue;
    const rate = withSignal.filter((s) => s.converted).length / withSignal.length;
    const lift = clamp(baselineRate > 0 ? rate / baselineRate : 1, MIN_LIFT, MAX_LIFT);
    const defaultWeight = base[key];
    // A signal that converts better should pull harder. For a penalty (negative
    // default) "converts better" means the penalty shrinks, so invert the lift.
    const factor = defaultWeight >= 0 ? lift : 1 / lift;
    const next = Math.round(defaultWeight * factor);
    if (next === defaultWeight) continue;
    weights[key] = next;
    changes.push({
      key,
      label: SIGNAL_LABEL[key],
      from: defaultWeight,
      to: next,
      samples: withSignal.length,
      conversionRate: Math.round(rate * 1000) / 10,
      lift: Math.round(lift * 100) / 100,
    });
  }

  changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));

  return {
    status: "fitted",
    weights,
    changes,
    samples: total,
    conversions,
    baselineRate: Math.round(baselineRate * 1000) / 10,
    note:
      changes.length === 0
        ? `Refit against ${total} conversations and nothing moved — the current weighting already matches your results.`
        : `Refit against ${total} conversations (${conversions} converted, ${Math.round(
            baselineRate * 1000,
          ) / 10}% baseline). ${changes.length} signal${changes.length === 1 ? "" : "s"} moved.`,
  };
}

/** One-line plain-language summary of a single weight change. */
export function describeChange(c: WeightChange): string {
  const direction = Math.abs(c.to) > Math.abs(c.from) ? "counts for more" : "counts for less";
  return `${c.label} ${direction} (${c.from} → ${c.to}): ${c.conversionRate}% of ${c.samples} such conversations converted.`;
}
