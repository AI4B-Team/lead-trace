import { describe, it, expect } from "vitest";
import {
  assess,
  licensedRecordTemplateIds,
  openDataRecordTemplateIds,
} from "./template-health.shared";
import { REALEFLOW_LEAD_CONFIGS } from "./data-providers/realeflow-source.shared";
import { templateForRecordType } from "./record-types";
import { TEMPLATES } from "./templates";
import { templateAdapterStatus } from "./template-schema";

describe("health data-path membership", () => {
  it("maps every RealeFlow record type onto a template", () => {
    for (const config of REALEFLOW_LEAD_CONFIGS) {
      expect(templateForRecordType(config.recordType)).toBeTruthy();
    }
  });

  it("covers the entitled licensed types", () => {
    const enabled = licensedRecordTemplateIds({ enabledOnly: true });
    expect(enabled).toContain("probate");
    expect(enabled).toContain("tax");
    expect(enabled).toContain("vacancy");
  });

  it("an open-data verdict cannot reach a licensed template", () => {
    const openData = openDataRecordTemplateIds();
    expect(openData).toContain("code");
    for (const id of licensedRecordTemplateIds()) {
      expect(openData).not.toContain(id);
    }
  });

  it("a licensed verdict cannot reach the open-data templates", () => {
    const licensed = licensedRecordTemplateIds({ enabledOnly: true });
    for (const id of openDataRecordTemplateIds()) {
      expect(licensed).not.toContain(id);
    }
  });

  it("entitlement-pending types are not open-data-backed", () => {
    const pending = REALEFLOW_LEAD_CONFIGS.filter((c) => !c.enabled).map((c) =>
      templateForRecordType(c.recordType),
    );
    const openData = openDataRecordTemplateIds();
    for (const id of pending) expect(openData).not.toContain(id);
  });

  it("every entitled licensed template reports a live adapter", () => {
    // A stale `beta: true` on a wired template lights up the "Isn't Wired Yet /
    // Launching Soon" waitlist UI and blocks the run, even though rows flow via
    // the licensed RealeFlow /search path. Probate/tax/vacancy are all live.
    for (const id of licensedRecordTemplateIds({ enabledOnly: true })) {
      const template = TEMPLATES.find((t) => t.id === id);
      expect(template, `missing template for ${id}`).toBeTruthy();
      expect(templateAdapterStatus(template!)).toBe("live");
    }
  });
});

describe("assess", () => {
  it("still marks a genuinely empty probe broken", () => {
    expect(assess({ rows: [], baseline: {} }).status).toBe("broken");
  });

  it("treats a hard error as broken", () => {
    expect(assess({ rows: [], baseline: {}, hardError: "boom" }).status).toBe("broken");
  });
});
