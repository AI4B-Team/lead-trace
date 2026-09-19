// Per-user live-pull model (Tyler 2026-09-16): pulls run on demand under the
// requesting user's own account; pooled warehouse rows never backfill an
// account-scoped pull; reach is nationwide via roster + autocomplete.
import { describe, expect, it, vi, beforeEach } from "vitest";

const rfSearch = vi.fn();
const rfAutocomplete = vi.fn();
const accountIdForUser = vi.fn();

vi.mock("../realeflow/client.server", () => ({
  rfSearch: (...a: unknown[]) => rfSearch(...a),
  rfAutocomplete: (...a: unknown[]) => rfAutocomplete(...a),
}));
vi.mock("../realeflow/accounts.server", () => ({
  accountIdForUser: (...a: unknown[]) => accountIdForUser(...a),
}));
vi.mock("../distress-feed.server", () => ({
  splitOwner: (name: string) => ({
    first: name ? name.split(" ")[0] ?? null : null,
    last: name ? name.split(" ").slice(1).join(" ") || null : null,
    entity: null,
  }),
}));

const property = {
  address_hash: "H1",
  address_number: "1",
  address_street: "Oak St",
  address_city: "Cheyenne",
  address_state: "WY",
  address_zip: "82001",
  owner_std_name1_full: "Jane Doe",
  property_value: 100000,
};

describe("realeflow-live per-user pull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rfSearch.mockResolvedValue({ data: [property] });
    accountIdForUser.mockResolvedValue(null);
  });

  it("serves enabled RealeFlow types and rejects others", async () => {
    const { isLiveServable } = await import("./realeflow-live.server");
    expect(isLiveServable("Probate")).toBe(true);
    expect(isLiveServable("Pre-Foreclosure / Lis Pendens")).toBe(true);
    expect(isLiveServable("Code Violation")).toBe(false);
  });

  it("resolves roster counties statically without network", async () => {
    const { resolveCountyLive } = await import("./realeflow-live.server");
    const entry = await resolveCountyLive("Hillsborough, FL");
    expect(entry).toMatchObject({ state: "FL", fips: "12057" });
    expect(rfAutocomplete).not.toHaveBeenCalled();
  });

  it("resolves a NON-roster county through autocomplete (nationwide reach)", async () => {
    rfAutocomplete.mockResolvedValue([
      {
        type: "county",
        text: "Laramie County, WY",
        county: { county: "Laramie County", state: "WY", fips: 56021 },
      },
    ]);
    const { resolveCountyLive } = await import("./realeflow-live.server");
    const entry = await resolveCountyLive("Laramie, WY");
    expect(entry).toMatchObject({ state: "WY", county: "Laramie", fips: "56021" });
  });

  it("refuses ambiguous bare names outside the roster", async () => {
    const { resolveCountyLive } = await import("./realeflow-live.server");
    expect(await resolveCountyLive("Laramie")).toBeNull();
    expect(rfAutocomplete).not.toHaveBeenCalled();
  });

  it("falls back to the env test account while the flag is OFF", async () => {
    const { liveRealeflowPull } = await import("./realeflow-live.server");
    const res = await liveRealeflowPull({
      countyLabel: "Hillsborough, FL",
      recordTypes: ["Probate"],
      actorUserId: "user-1",
    });
    expect(res.accountScoped).toBe(false);
    expect(res.leads.length).toBe(1);
    // No accountId override → client uses env REALEFLOW_ACCOUNT_ID.
    expect(rfSearch).toHaveBeenCalledWith(expect.anything(), {});
  });

  it("routes under the user's OWN account when the mapping exists", async () => {
    accountIdForUser.mockResolvedValue("777001");
    const { liveRealeflowPull } = await import("./realeflow-live.server");
    const res = await liveRealeflowPull({
      countyLabel: "Hillsborough, FL",
      recordTypes: ["Probate"],
      actorUserId: "user-1",
    });
    expect(res.accountScoped).toBe(true);
    expect(rfSearch).toHaveBeenCalledWith(expect.anything(), { accountId: "777001" });
  });

  it("an unresolvable county reports resolved=false and pulls nothing", async () => {
    rfAutocomplete.mockResolvedValue([]);
    const { liveRealeflowPull } = await import("./realeflow-live.server");
    const res = await liveRealeflowPull({
      countyLabel: "Nowhere, ZZ",
      recordTypes: ["Probate"],
    });
    expect(res.resolved).toBe(false);
    expect(res.leads).toEqual([]);
    expect(rfSearch).not.toHaveBeenCalled();
  });

  it("one failing record type never sinks the county's other types", async () => {
    rfSearch
      .mockRejectedValueOnce(new Error("not available on this account"))
      .mockResolvedValueOnce({ data: [property] });
    const { liveRealeflowPull } = await import("./realeflow-live.server");
    const res = await liveRealeflowPull({
      countyLabel: "Hillsborough, FL",
      recordTypes: ["Probate", "Vacancy / Demolition Notice"],
    });
    expect(res.leads.length).toBe(1);
  });
});
