/**
 * Freshness is the product. A surplus list is a point-in-time snapshot — if a
 * claim was filed yesterday, today's list is wrong. So the promise is never
 * "here are surplus records", it is "here are surplus records, confirmed as of
 * this morning, with N days left".
 *
 * Age is shown even when it is bad: a visible "Confirmed 9 days ago" earns more
 * trust than a silent stale number.
 */

export type RefreshCadence = "daily" | "weekly" | "biweekly" | "monthly";

export const CADENCE_DAYS: Record<RefreshCadence, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** Statuses that take a record off active lists. Retained, never deleted. */
export const CLOSED_CLAIM_STATUSES = ["claim_filed", "disbursed", "escheated"] as const;

export function isClosedClaim(status: string | null | undefined): boolean {
  return (CLOSED_CLAIM_STATUSES as readonly string[]).includes(status ?? "");
}

export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export type FreshnessState = "fresh" | "stale" | "source_broken" | "unknown";

export type Freshness = {
  state: FreshnessState;
  /** Human label, always populated — the age is never hidden. */
  label: string;
  days: number | null;
};

/**
 * Freshness of one confirmation, judged against its source's cadence. A source
 * broken for more than two cycles marks its records "Confirmation stale"
 * rather than hiding the problem.
 */
export function confirmationFreshness(args: {
  confirmedAsOf: string | null | undefined;
  cadence?: RefreshCadence | null;
  sourceStatus?: string | null;
  sourceLastSuccessAt?: string | null;
  now?: Date;
}): Freshness {
  const now = args.now ?? new Date();
  const days = daysSince(args.confirmedAsOf, now);
  if (days == null) {
    return { state: "unknown", label: "Never confirmed", days: null };
  }
  const label = days === 0 ? "Confirmed today" : `Confirmed ${days} day${days === 1 ? "" : "s"} ago`;
  const cycle = CADENCE_DAYS[args.cadence ?? "weekly"];

  const sourceAge = daysSince(args.sourceLastSuccessAt, now);
  const brokenSource =
    args.sourceStatus === "broken" || (sourceAge != null && sourceAge > cycle * 2);
  if (brokenSource) {
    return { state: "source_broken", label: `Confirmation stale — ${label.toLowerCase()}`, days };
  }
  if (days > cycle) return { state: "stale", label, days };
  return { state: "fresh", label, days };
}

/**
 * Re-check cadence: daily inside 30 days of a deadline, weekly otherwise.
 * A closed claim is never re-checked.
 */
export function recheckDueAt(args: {
  lastCheckedAt: string | null | undefined;
  claimDeadline?: string | null;
  claimStatus?: string | null;
  now?: Date;
}): { due: boolean; intervalDays: number } {
  const now = args.now ?? new Date();
  if (isClosedClaim(args.claimStatus)) return { due: false, intervalDays: 0 };

  let intervalDays = 7;
  if (args.claimDeadline) {
    const left = Math.round(
      (Date.parse(`${args.claimDeadline.slice(0, 10)}T00:00:00Z`) -
        Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)) /
        86_400_000,
    );
    if (Number.isFinite(left) && left >= 0 && left <= 30) intervalDays = 1;
  }
  const age = daysSince(args.lastCheckedAt, now);
  return { due: age == null || age >= intervalDays, intervalDays };
}

/** Source health line for the county list — failures included, not hidden. */
export function sourceHealthLabel(args: {
  status: string;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  consecutiveFailures?: number | null;
  now?: Date;
}): string {
  const now = args.now ?? new Date();
  if (args.status === "unverified") return "Not yet verified";
  if (args.status === "manual") return "Public records request — no portal";
  const ok = daysSince(args.lastSuccessAt, now);
  const checked = daysSince(args.lastCheckedAt, now);
  if (args.status === "broken") {
    return ok == null
      ? "Broken — never succeeded"
      : `Broken — last success ${ok} day${ok === 1 ? "" : "s"} ago`;
  }
  if (ok == null) return checked == null ? "Never checked" : "Checked, no data yet";
  const line = ok === 0 ? "Updated today" : `Updated ${ok} day${ok === 1 ? "" : "s"} ago`;
  return (args.consecutiveFailures ?? 0) > 0 ? `${line} · ${args.consecutiveFailures} failures since` : line;
}
