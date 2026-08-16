// Drop planning: large clean lists are split into fixed-size drops (default 500)
// and spread across the day instead of one simultaneous blast.

export const DEFAULT_DROP_TIMES = ["10:00", "12:00", "15:00", "17:00"];

export type PlannedDrop = { drop_index: number; scheduled_at: string; size: number };

/** Render a 24h "HH:MM" string as friendly 12-hour time, e.g. "3:00 PM". */
export function formatTime12(value: string): string {
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const m = (mRaw ?? "00").padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** Split `total` contacts into `dropSize` batches scheduled across `times` per day. */
export function planDrops(
  total: number,
  dropSize = 500,
  times: string[] = DEFAULT_DROP_TIMES,
  from: Date = new Date(),
  /** When true, the first drop goes out immediately and the rest use the slots. */
  instant = false,
): PlannedDrop[] {
  const size = Math.max(1, dropSize);
  const slots = times.length ? times : DEFAULT_DROP_TIMES;
  const count = Math.ceil(Math.max(0, total) / size);
  const drops: PlannedDrop[] = [];
  let remaining = total;
  // Slots are consumed in chronological order, skipping any that already passed
  // today. Assigning a slot by index and then pushing past ones to tomorrow
  // would put a later drop ahead of an earlier one (e.g. at 16:00 with
  // 10/12/15/17 slots, drop 4 would send today while drops 1-3 waited a day).
  const ordered = [...slots]
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return { h: h || 0, m: m || 0 };
    })
    .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));

  const upcoming = (index: number): Date => {
    // Walk forward day by day, taking only slots still in the future.
    let seen = 0;
    for (let day = 0; day < 400; day += 1) {
      for (const slot of ordered) {
        const when = new Date(from);
        when.setDate(when.getDate() + day);
        when.setHours(slot.h, slot.m, 0, 0);
        if (when.getTime() <= from.getTime()) continue;
        if (seen === index) return when;
        seen += 1;
      }
    }
    return new Date(from.getTime() + (index + 1) * 24 * 60 * 60_000);
  };

  let slotCursor = 0;
  for (let i = 0; i < count; i++) {
    const scheduledAt =
      instant && i === 0 ? new Date(from.getTime()) : upcoming(slotCursor++);
    drops.push({
      drop_index: i + 1,
      scheduled_at: scheduledAt.toISOString(),
      size: Math.min(size, remaining),
    });
    remaining -= size;
  }
  return drops;
}

/** SMS segment count for GSM-7 style bodies (160 / 153 concatenated). */
export function segmentsFor(body: string): number {
  const len = body.length;
  if (len === 0) return 0;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

/** Estimated credits for a full campaign: recipients x segments across all steps. */
export function estimateCost(
  recipients: number,
  steps: Array<{ message_variants: string[] }>,
  creditsPerSegment = 1,
) {
  let segmentsPerRecipient = 0;
  for (const s of steps) {
    const longest = s.message_variants.reduce((a, b) => (b.length > a.length ? b : a), "");
    segmentsPerRecipient += segmentsFor(longest);
  }
  const segments = recipients * segmentsPerRecipient;
  return { recipients, segmentsPerRecipient, segments, credits: segments * creditsPerSegment };
}