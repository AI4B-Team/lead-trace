import { describe, expect, it } from "vitest";
import { contactPhones, groupContacts, identityKeys, normalisePhone10 } from "./contact-lines.shared";
import { ineligibleReason, nominateLeads, scoreLead, type ScoutLead } from "./agents/scout.shared";

const line = (o: Partial<Parameters<typeof identityKeys>[0]> & { id: string }) => ({
  phone: null,
  ...o,
});

describe("contact identity", () => {
  it("normalises every stored spelling of a number to ten digits", () => {
    for (const p of ["(312) 555-0142", "312-555-0142", "13125550142", "+13125550142"]) {
      expect(normalisePhone10(p)).toBe("3125550142");
    }
    expect(normalisePhone10("555-0142")).toBeNull();
  });

  it("does not merge two owners who only share an address", () => {
    const groups = groupContacts([
      line({ id: "a", phone: "3125550142", fullName: "Dana Ruiz", address: "12 Oak St" }),
      line({ id: "b", phone: "3125559999", fullName: "Peter Vance", address: "12 Oak St" }),
    ]);
    expect(groups.get("a")).not.toBe(groups.get("b"));
  });

  it("links a second number for the same owner at the same address", () => {
    const groups = groupContacts([
      line({ id: "a", phone: "3125550142", fullName: "Dana Ruiz", address: "12 Oak St" }),
      line({ id: "b", phone: "3125559999", fullName: "Dana Ruiz", address: "12 Oak St" }),
    ]);
    expect(groups.get("a")).toBe(groups.get("b"));
  });

  it("links transitively: shared phone, then shared name+address", () => {
    const lines = [
      line({ id: "a", phone: "3125550142", fullName: "Dana Ruiz", address: "12 Oak St" }),
      line({ id: "b", phone: "3125550142", fullName: null, address: null }),
      line({ id: "c", phone: "7735551188", fullName: "Dana Ruiz", address: "12 Oak St" }),
    ];
    const groups = groupContacts(lines);
    expect(new Set([groups.get("a"), groups.get("b"), groups.get("c")]).size).toBe(1);
    // THE rule: an opt-out on any of these must close all three numbers.
    expect(contactPhones(lines, ["b"]).sort()).toEqual(["3125550142", "7735551188"]);
  });

  it("leaves unrelated contacts out of the suppression set", () => {
    const lines = [
      line({ id: "a", phone: "3125550142", fullName: "Dana Ruiz", address: "12 Oak St" }),
      line({ id: "z", phone: "9045552211", fullName: "Marta Lowe", address: "88 Pine Ave" }),
    ];
    expect(contactPhones(lines, ["a"])).toEqual(["3125550142"]);
  });
});

const scoutLead = (o: Partial<ScoutLead> & { id: string }): ScoutLead => ({
  fullName: "Dana Ruiz",
  address: "12 Oak St",
  city: "Chicago",
  state: "IL",
  phone: "3125550142",
  phoneType: "mobile",
  disposition: "new",
  recordTypes: ["foreclosure"],
  sourceTypes: ["county"],
  listCount: 1,
  firstSeenAt: null,
  lastSeenAt: null,
  lastTouchedAt: null,
  touches: 0,
  hasReplied: false,
  lastOutcome: null,
  sequenceStatus: null,
  anchorDaysRemaining: null,
  ...o,
});

describe("scout multi-line behaviour", () => {
  it("refuses a line whose contact opted out elsewhere", () => {
    expect(ineligibleReason(scoutLead({ id: "b", contactOptedOut: true }))).toBe(
      "contact opted out on another line",
    );
  });

  it("credits an untried second number for a worked contact", () => {
    const nom = scoreLead(scoutLead({ id: "b", contactLines: 2, contactTouches: 3, touches: 0 }));
    expect(nom.signals).toContain("untried_line");
  });

  it("nominates a contact once, keeping the highest-scoring line", () => {
    const leads = [
      scoutLead({ id: "low", contactKey: "c1", anchorDaysRemaining: null }),
      scoutLead({ id: "high", contactKey: "c1", anchorDaysRemaining: 3 }),
      scoutLead({ id: "other", contactKey: "c2" }),
    ];
    const { nominations } = nominateLeads(leads, 10);
    expect(nominations.map((n) => n.leadId).sort()).toEqual(["high", "other"]);
  });
});
