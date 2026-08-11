/**
 * Claim deadlines — the liability surface of the whole feature.
 *
 * If we say a deadline is October 14 and it was September 14, a customer lost a
 * claim because of this product. That is a different risk class from a stale
 * phone number, so the rules here are deliberately unforgiving:
 *
 *  - Deadlines come from a seeded, versioned statute table with a citation.
 *  - Nothing is computed unless a human set `verified_at` on that row.
 *  - Nothing is ever estimated, inferred, or asked of a model at runtime.
 *  - A deadline the clerk publishes always beats a computed one.
 */

export type SaleKind = "foreclosure" | "tax_deed";

export type StatuteRow = {
  state: string;
  sale_kind: string;
  statute_citation: string;
  claim_window_days: number | null;
  window_starts_from: string | null;
  fee_cap_pct: number | null;
  requires_finder_license: boolean | null;
  verified_at: string | null;
  verified_by?: string | null;
  source_url?: string | null;
};

export type DeadlineBasis = {
  sale_date?: string | null;
  notice_date?: string | null;
  certificate_date?: string | null;
};

export type DeadlineResult =
  | { status: "clerk"; deadline: string; citation: string | null }
  | { status: "computed"; deadline: string; citation: string; startedFrom: string }
  | { status: "unverified"; reason: string; citation: string | null }
  | { status: "unknown"; reason: string; citation: string | null };

/** The statute row that governs a state + sale kind, preferring a verified one. */
export function statuteFor(
  statutes: readonly StatuteRow[],
  state: string,
  saleKind: SaleKind,
): StatuteRow | null {
  const scoped = statutes.filter(
    (s) => s.state.toUpperCase() === state.toUpperCase() && s.sale_kind === saleKind,
  );
  if (!scoped.length) return null;
  // A verified row with a day count is the only one that can produce a date;
  // prefer it, then fall back so the citation can still be surfaced.
  return (
    scoped.find((s) => s.verified_at && s.claim_window_days != null) ??
    scoped.find((s) => s.claim_window_days != null) ??
    scoped[0]!
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the deadline for one record. `clerkDeadline` is whatever the county
 * published; it wins unconditionally because it is the authority.
 */
export function resolveClaimDeadline(args: {
  state: string;
  saleKind: SaleKind;
  statutes: readonly StatuteRow[];
  basis: DeadlineBasis;
  clerkDeadline?: string | null;
}): DeadlineResult {
  const statute = statuteFor(args.statutes, args.state, args.saleKind);
  const citation = statute?.statute_citation ?? null;

  if (args.clerkDeadline) {
    return { status: "clerk", deadline: args.clerkDeadline.slice(0, 10), citation };
  }
  if (!statute) {
    return { status: "unknown", reason: "No statute on file for this state", citation: null };
  }
  if (!statute.verified_at || statute.claim_window_days == null || !statute.window_starts_from) {
    return {
      status: "unverified",
      reason: "Deadline not verified for this state",
      citation,
    };
  }

  const from =
    statute.window_starts_from === "notice_date"
      ? args.basis.notice_date
      : statute.window_starts_from === "certificate_date"
        ? args.basis.certificate_date
        : args.basis.sale_date;
  if (!from) {
    return {
      status: "unknown",
      reason: `Missing ${statute.window_starts_from.replace(/_/g, " ")} for this record`,
      citation,
    };
  }
  return {
    status: "computed",
    deadline: addDays(from, statute.claim_window_days),
    citation: statute.statute_citation,
    startedFrom: statute.window_starts_from,
  };
}

/** Whole days from `today` until the deadline. Negative once it has passed. */
export function daysUntil(deadline: string, today: Date = new Date()): number {
  const a = new Date(`${deadline.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** Fee-cap / licensing language for a state, drawn from the statute rows only. */
export function feeCapNote(statutes: readonly StatuteRow[], state: string): string | null {
  const rows = statutes.filter((s) => s.state.toUpperCase() === state.toUpperCase());
  const cap = rows.find((s) => s.fee_cap_pct != null);
  if (!cap) return null;
  const license = rows.some((s) => s.requires_finder_license);
  return `${cap.statute_citation} caps recovery fees at ${cap.fee_cap_pct}%${
    license ? " and requires finder registration" : ""
  }.`;
}
