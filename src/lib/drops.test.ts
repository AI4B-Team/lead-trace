import { describe, expect, it } from "vitest";
import { planDrops } from "./drops";

describe("planDrops", () => {
  it("schedules every drop in chronological order when the day is half over", () => {
    const from = new Date("2026-03-10T16:00:00");
    const drops = planDrops(2000, 500, ["10:00", "12:00", "15:00", "17:00"], from);
    expect(drops).toHaveLength(4);
    const times = drops.map((d) => new Date(d.scheduled_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // First remaining slot today is 17:00, then tomorrow's slots.
    expect(new Date(drops[0]!.scheduled_at).getHours()).toBe(17);
    expect(new Date(drops[1]!.scheduled_at).getHours()).toBe(10);
  });

  it("sends the first drop immediately in instant mode and keeps the rest ordered", () => {
    const from = new Date("2026-03-10T09:00:00");
    const drops = planDrops(1500, 500, ["10:00", "12:00"], from, true);
    expect(drops[0]!.scheduled_at).toBe(from.toISOString());
    const times = drops.map((d) => new Date(d.scheduled_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("sizes the final drop to the remainder", () => {
    const drops = planDrops(1100, 500, ["10:00"], new Date("2026-03-10T08:00:00"));
    expect(drops.map((d) => d.size)).toEqual([500, 500, 100]);
  });
});
