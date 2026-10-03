import { describe, expect, it } from "vitest";
import { assertCanAssignRole, assignableRoles } from "./team-roles.shared";

describe("invite role ceiling", () => {
  it("rejects an admin's owner-level invite with a clear error", () => {
    expect(() => assertCanAssignRole("admin", "owner")).toThrow(/cannot assign the owner role/);
  });
  it("lets an admin invite member or admin", () => {
    expect(() => assertCanAssignRole("admin", "member")).not.toThrow();
    expect(() => assertCanAssignRole("admin", "admin")).not.toThrow();
  });
  it("lets an owner invite an owner", () => {
    expect(() => assertCanAssignRole("owner", "owner")).not.toThrow();
  });
  it("blocks members, viewers and non-members entirely", () => {
    for (const r of ["member", "viewer", null]) {
      expect(() => assertCanAssignRole(r, "viewer")).toThrow();
      expect(assignableRoles(r)).toEqual([]);
    }
  });
});
