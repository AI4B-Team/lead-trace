import { describe, expect, it } from "vitest";
import { buildFunnel, funnelViolations, stageFillPercent } from "./funnel-math";

const ROOFER_RUN = { found: 168, deduped: 12, verified: 12, traced: 0, scrubbed: 12, clean: 8 };

describe("funnel arithmetic", () => {
  it("keeps every stage equal to the previous stage minus its delta", () => {
    const stages = buildFunnel(ROOFER_RUN);
    expect(funnelViolations(stages, { readyToSend: 8, exportedRows: 8 })).toEqual([]);
  });

  it("shows remaining counts, not removals", () => {
    const stages = buildFunnel(ROOFER_RUN);
    expect(stages.map((s) => s.remaining)).toEqual([168, 12, 12, 12, 12, 8]);
    expect(stages[1]!.delta).toBe("156 Removed");
    expect(stages[5]!.remaining).toBe(8);
    expect(stages[5]!.delta).toBeNull();
    expect(stages[5]!.annotation).toBe("Launch Ready");
  });

  it("never renders a negative number for skip trace", () => {
    const none = buildFunnel(ROOFER_RUN)[3]!;
    expect(none.delta).toBeNull();
    expect(none.annotation).toBe("Not Needed");
    const traced = buildFunnel({ ...ROOFER_RUN, traced: 5 })[3]!;
    expect(traced.remaining).toBe(12);
    expect(traced.annotation).toBe("5 Traced");
  });

  it("clamps so the funnel can never widen", () => {
    const stages = buildFunnel({ found: 10, deduped: 99, verified: 99, traced: 99, scrubbed: 99, clean: 99 });
    expect(stages.every((s) => s.remaining <= 10)).toBe(true);
    expect(funnelViolations(stages)).toEqual([]);
  });

  it("flags a mismatch between Clean and the Ready To Send card", () => {
    const stages = buildFunnel(ROOFER_RUN);
    expect(funnelViolations(stages, { readyToSend: 9 })).toHaveLength(1);
  });

  it("says carrier/scrub are coming soon when phones are pending", () => {
    // A records run that produced rows but no phone (no phone vendor yet).
    const pending = buildFunnel(
      { found: 206, deduped: 206, verified: 206, traced: 0, scrubbed: 206, clean: 0 },
      { phonesPending: true },
    );
    const verified = pending.find((s) => s.key === "verified")!;
    const scrubbed = pending.find((s) => s.key === "scrubbed")!;
    expect(verified.annotation).toBe("Carrier Check Coming Soon");
    expect(scrubbed.annotation).toBe("No Phone To Scrub Yet");

    // Default (phones present / normal run) keeps the confident wording.
    const normal = buildFunnel(ROOFER_RUN);
    expect(normal.find((s) => s.key === "verified")!.annotation).toBe("Carrier Checked");
    expect(normal.find((s) => s.key === "scrubbed")!.annotation).toBe("Compliance Checked");
  });

  it("scales bars proportionally with a visible floor", () => {
    expect(stageFillPercent(168, 168)).toBe(100);
    expect(stageFillPercent(12, 168)).toBe(8);
    expect(stageFillPercent(0, 168)).toBe(0);
  });
});