/**
 * Funnel arithmetic for the Job Progress / Results page.
 *
 * Every stage reports the number of records REMAINING after that stage runs.
 * Stages that remove records carry a negative delta badge; stages that only
 * pass records through (Skip Trace, and Verify when nothing fails) carry a
 * neutral annotation instead — a zero is never rendered as "−0", because that
 * reads like a failure.
 *
 * The invariant that must always hold, on every surface and in the export:
 *   remaining[i] === remaining[i - 1] - removed[i]
 * and clean === the "Ready To Send" card === the exported clean file rows.
 */

export type FunnelStageKey =
  | "found"
  | "deduped"
  | "verified"
  | "emailFound"
  | "skipTraced"
  | "scrubbed"
  | "exported"
  | "parcels"
  | "ownership"
  | "financial"
  | "filtered"
  | "auctions"
  | "soldThirdParty"
  | "aboveBaseline"
  | "clean";

export type FunnelStage = {
  key: FunnelStageKey;
  label: string;
  /** Records still in the pipeline after this stage. */
  remaining: number;
  /** Records this stage removed (always >= 0). */
  removed: number;
  /** Delta badge text, or null when the stage removed nothing. */
  delta: string | null;
  /** Neutral text shown when there is no delta (pass-through stages). */
  annotation: string | null;
};

export type FunnelInput = {
  found: number;
  deduped: number;
  verified: number;
  /** How many records were skip traced (a fill, not a removal). */
  traced: number;
  scrubbed: number;
  clean: number;
};

const n = (v: number | null | undefined) => Math.max(0, Math.round(v ?? 0));

export type FunnelVariant = "phone" | "creator" | "data" | "scan";

/**
 * Normalize raw job counters into a monotonically narrowing funnel. Each stage
 * is clamped to the previous one so the story is always a drop.
 *
 * Creator-source runs (TikTok/Instagram/YouTube) deliver emails, not phones, so
 * their funnel replaces the verify stage with "Email Found" and never renders
 * "Mobile Verified" or "Skip Traced" at all.
 */
export function buildFunnel(
  input: FunnelInput,
  opts?: { variant?: FunnelVariant; phonesPending?: boolean },
): FunnelStage[] {
  const variant = opts?.variant ?? "phone";
  // When a records/property run produced rows but no phone (no phone vendor
  // connected yet), the carrier check and DNC scrub never actually ran on a
  // number. Say so honestly instead of claiming "Carrier Checked" /
  // "Compliance Checked" on stages that were pass-through.
  const phonesPending = opts?.phonesPending === true;
  const found = n(input.found);
  const deduped = Math.min(n(input.deduped), found);
  const verified = Math.min(n(input.verified), deduped);
  const traced = Math.min(n(input.traced), verified);
  // Skip Trace fills missing phones — it never removes rows.
  const skipTraced = verified;
  const scrubbed = Math.min(n(input.scrubbed), skipTraced);
  const clean = Math.min(n(input.clean), scrubbed);

  const stage = (
    key: FunnelStageKey,
    label: string,
    remaining: number,
    prev: number | null,
    opts?: { annotation?: string; removalNoun?: string; alwaysAnnotate?: boolean },
  ): FunnelStage => {
    const removed = prev == null ? 0 : Math.max(0, prev - remaining);
    return {
      key,
      label,
      remaining,
      removed,
      delta:
        removed > 0 && !opts?.alwaysAnnotate
          ? `${removed.toLocaleString()} ${opts?.removalNoun ?? "Removed"}`
          : null,
      annotation:
        removed > 0 && !opts?.alwaysAnnotate ? null : (opts?.annotation ?? null),
    };
  };

  const stages: FunnelStage[] = [
    stage("found", "Found", found, null, { annotation: "Source Records" }),
    stage("deduped", "Deduped", deduped, found, { removalNoun: "Removed" }),
  ];

  if (variant === "scan") {
    // Street Scan narrows parcels with free data filters BEFORE any imagery
    // is bought, so its cascade is the buy box itself, stage by stage.
    return [
      stage("parcels", "Parcels In Area", found, null, { annotation: "Candidate Parcels" }),
      stage("ownership", "Ownership + Tenure", deduped, found, { removalNoun: "Filtered" }),
      stage("financial", "Equity + Age", verified, deduped, { removalNoun: "Filtered" }),
      stage("filtered", "Permit + Negative Filters", scrubbed, verified, { removalNoun: "Filtered" }),
      stage("clean", "Matched", clean, scrubbed, { annotation: "Scored + Ready", alwaysAnnotate: true }),
    ];
  }

  // Research datasets never touch the compliance pipeline: they collapse to
  // Found -> Deduped -> Exported.
  if (variant === "data") {
    stages.push(
      stage("exported", "Exported", deduped, deduped, { annotation: "Dataset Ready", alwaysAnnotate: true }),
    );
    return stages;
  }

  stages.push(
    variant === "creator"
      ? stage("emailFound", "Email Found", verified, deduped, {
          removalNoun: "No Contact Info",
          annotation: "Contact Email Present",
        })
      : stage("verified", "Mobile Verified", verified, deduped, {
          // When phones are pending the box itself reads "Coming Soon", so the
          // caption is left blank to avoid repeating it under the card.
          annotation: phonesPending ? undefined : "Carrier Checked",
        }),
    ...(variant === "creator"
      ? []
      : [
          stage("skipTraced", "Skip Traced", skipTraced, skipTraced, {
            annotation: traced > 0 ? `${traced.toLocaleString()} Traced` : "Not Needed",
          }),
        ]),
    stage("scrubbed", "Scrubbed", scrubbed, skipTraced, {
      removalNoun: "DNC & Litigators Removed",
      // The box reads "Coming Soon" when phones are pending; no caption needed.
      annotation: phonesPending ? undefined : "Compliance Checked",
    }),
    stage("clean", "Clean", clean, scrubbed, { annotation: "Launch Ready", alwaysAnnotate: true }),
  );
  return stages;
}

/** Bar fill for a stage, proportional to Found with a visible floor. */
/**
 * Surplus Funds funnel. Derived from completed auctions, so it narrows the
 * same way every other pipeline does — auctions fetched, then only third-party
 * sales, then only sales above the baseline owed, then the records written.
 * Never a pass-through: a county that exposes no sold amounts lands at zero
 * with the gap counted, which is the honest answer.
 */
export function buildSurplusFunnel(input: {
  auctions: number;
  soldToThirdParty: number;
  aboveBaseline: number;
  created: number;
  soldAmountUnavailable: number;
}): FunnelStage[] {
  const auctions = n(input.auctions);
  const thirdParty = Math.min(n(input.soldToThirdParty), auctions);
  const above = Math.min(n(input.aboveBaseline), thirdParty);
  const created = Math.min(n(input.created), above);
  const gap = n(input.soldAmountUnavailable);

  const stage = (key: FunnelStageKey, label: string, remaining: number, prev: number | null, annotation?: string): FunnelStage => {
    const removed = prev == null ? 0 : Math.max(0, prev - remaining);
    return {
      key,
      label,
      remaining,
      removed,
      delta: removed > 0 ? `${removed.toLocaleString()} Removed` : null,
      annotation: removed > 0 ? null : (annotation ?? null),
    };
  };

  return [
    stage("auctions", "Auctions Fetched", auctions, null, "Completed Sale Days"),
    stage("soldThirdParty", "Sold To Third Party", thirdParty, auctions,
      gap > 0 ? `${gap.toLocaleString()} Sold Amount Unavailable` : "Outside Bidder"),
    stage("aboveBaseline", "Surplus Above Baseline", above, thirdParty, "Sold Over Amount Owed"),
    stage("clean", "Records Created", created, above, "Estimated Surplus"),
  ];
}

/** Bar fill for a stage, proportional to Found with a visible floor. */
export function stageFillPercent(remaining: number, found: number, min = 8) {
  const max = Math.max(found, 1);
  if (remaining <= 0) return 0;
  return Math.min(100, Math.max(min, Math.round((remaining / max) * 100)));
}

/**
 * Arithmetic guard: every stage must equal the previous stage minus its own
 * removal, and Clean must match the Ready-To-Send / export row count.
 */
export function funnelViolations(
  stages: FunnelStage[],
  expectations?: { readyToSend?: number; exportedRows?: number },
): string[] {
  const errors: string[] = [];
  stages.forEach((s, i) => {
    if (i === 0 || s.key === "skipTraced" || s.key === "exported") return;
    const prev = stages[i - 1]!.remaining;
    if (prev - s.removed !== s.remaining) {
      errors.push(`${s.label}: ${prev} − ${s.removed} ≠ ${s.remaining}`);
    }
  });
  const last = stages[stages.length - 1];
  const clean = (last?.key === "exported" ? last.remaining : stages.find((s) => s.key === "clean")?.remaining) ?? 0;
  if (expectations?.readyToSend != null && expectations.readyToSend !== clean) {
    errors.push(`Ready To Send (${expectations.readyToSend}) ≠ Clean (${clean})`);
  }
  if (expectations?.exportedRows != null && expectations.exportedRows !== clean) {
    errors.push(`Exported rows (${expectations.exportedRows}) ≠ Clean (${clean})`);
  }
  return errors;
}