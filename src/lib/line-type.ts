/**
 * Line-type classification for the Verified stage.
 *
 * The carrier check runs on every sourced record. When "Mobile Numbers Only"
 * is enabled the pipeline DROPS landline/VoIP rows, so the Verified
 * stage reports a real delta instead of passing everything through.
 */
export type LineType = "mobile" | "landline" | "voip" | "unknown";

/**
 * Deterministic stand-in for a carrier lookup. Real providers replace this;
 * the shape (digits in → line type out) stays stable.
 */
export function classifyLineType(phone: string | null | undefined): LineType {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return "unknown";
  const national = d.length > 10 ? d.slice(-10) : d;
  const exchange = Number(national.slice(3, 6));
  if (Number.isNaN(exchange)) return "unknown";
  const bucket = exchange % 10;
  if (bucket === 0) return "landline";
  if (bucket === 1) return "voip";
  return "mobile";
}

export function isTextable(type: LineType) {
  return type === "mobile";
}

export type VerifyInput = { phone?: string | null };
export type VerifyResult<T> = {
  kept: Array<T & { line_type: LineType }>;
  removed: number;
  counts: Record<LineType, number>;
};

/**
 * Classify a batch and, when mobileOnly is on, keep only mobile rows.
 * Pure so the pipeline behavior is unit-testable.
 */
export function verifyLineTypes<T extends VerifyInput>(rows: T[], mobileOnly: boolean): VerifyResult<T> {
  return verifyBatch(rows, mobileOnly, false);
}

/**
 * Same as verifyLineTypes, but rows with no phone at all are kept so skip
 * trace still gets a chance to fill them before the final carrier gate.
 */
export function verifyPending<T extends VerifyInput>(rows: T[], mobileOnly: boolean): VerifyResult<T> {
  return verifyBatch(rows, mobileOnly, true);
}

function verifyBatch<T extends VerifyInput>(
  rows: T[],
  mobileOnly: boolean,
  keepMissing: boolean,
): VerifyResult<T> {
  const counts: Record<LineType, number> = { mobile: 0, landline: 0, voip: 0, unknown: 0 };
  const kept: Array<T & { line_type: LineType }> = [];
  for (const row of rows) {
    const line_type = classifyLineType(row.phone);
    counts[line_type] += 1;
    const missing = !(row.phone ?? "").replace(/\D/g, "");
    if (keepMissing && missing) {
      kept.push({ ...row, line_type });
      continue;
    }
    if (mobileOnly && !isTextable(line_type)) continue;
    kept.push({ ...row, line_type });
  }
  return { kept, removed: rows.length - kept.length, counts };
}

export type FinalGateResult<T> = {
  kept: Array<T & { line_type: LineType }>;
  /** Rows that already carried a mobile verdict and were NOT re-evaluated. */
  alreadyMobile: number;
  /** Rows this pass actually classified (skip-trace additions + still-missing). */
  evaluated: number;
  /** Evaluated rows dropped because the number is landline/VoIP. */
  removedNotMobile: number;
  /** Evaluated rows dropped because there is still no phone number at all. */
  removedNoPhone: number;
  /**
   * Phoneless rows kept anyway because they are deliverable property leads
   * (real address + owner) that simply have no phone vendor attached yet.
   */
  keptPhonelessProperty: number;
};

export type FinalGateOptions<T> = {
  /**
   * Rows matching this predicate survive with a blank phone instead of being
   * dropped as removedNoPhone. Landline/VoIP rows still drop under mobileOnly.
   */
  keepPhoneless?: (row: T) => boolean;
};

/**
 * Final carrier gate after skip trace.
 *
 * A row that already passed the carrier check as mobile is NEVER re-evaluated —
 * skip trace only ever appends to rows that had no number, so re-classifying an
 * already-verified row can only produce a false removal. Only rows without a
 * mobile verdict are checked here.
 */
export function verifyNewlyTraced<T extends VerifyInput & { line_type?: LineType }>(
  rows: T[],
  mobileOnly: boolean,
  options: FinalGateOptions<T> = {},
): FinalGateResult<T> {
  const kept: Array<T & { line_type: LineType }> = [];
  let alreadyMobile = 0;
  let evaluated = 0;
  let removedNotMobile = 0;
  let removedNoPhone = 0;
  let keptPhonelessProperty = 0;

  for (const row of rows) {
    if (row.line_type === "mobile") {
      alreadyMobile++;
      kept.push(row as T & { line_type: LineType });
      continue;
    }
    evaluated++;
    const line_type = classifyLineType(row.phone);
    const missing = !(row.phone ?? "").replace(/\D/g, "");
    if (missing && options.keepPhoneless?.(row)) {
      // A property lead with no phone is still mailable/knockable — keep it.
      keptPhonelessProperty++;
      kept.push({ ...row, line_type });
      continue;
    }
    if (mobileOnly && !isTextable(line_type)) {
      if (missing) removedNoPhone++;
      else removedNotMobile++;
      continue;
    }
    kept.push({ ...row, line_type });
  }
  return { kept, alreadyMobile, evaluated, removedNotMobile, removedNoPhone, keptPhonelessProperty };
}
