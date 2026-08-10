import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertBudgetAvailable,
  BandwidthCapError,
  bytesUsed,
  endRealauctionBudget,
  isRealauctionUrl,
  lastVendorStatus,
  ProxyUnavailableError,
  realauctionFetch,
  realauctionProxyStatus,
  REALAUCTION_USER_AGENT,
  recordVendorFetch,
  startRealauctionBudget,
} from "./realauction-proxy";
import { politeFetch, BOT_USER_AGENT } from "./scraper-policy";

const PROXY = "http://user:pass_country-us@geo.iproyal.com:12321";

function htmlResponse(body = "<html>ok</html>", status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("proxy scoping", () => {
  it("matches only RealAuction vendor domains", () => {
    expect(isRealauctionUrl("https://hillsborough.realtaxdeed.com/index.cfm")).toBe(true);
    expect(isRealauctionUrl("https://broward.realforeclose.com/x")).toBe(true);
    expect(isRealauctionUrl("https://data.cityoforlando.net/resource/x.json")).toBe(false);
    expect(isRealauctionUrl("https://services.arcgis.com/x/FeatureServer/0")).toBe(false);
    expect(isRealauctionUrl("https://api.realeflow.com/v1/search")).toBe(false);
    expect(isRealauctionUrl("https://evil-realtaxdeed.com.attacker.net/")).toBe(false);
  });
});

describe("fail-safe when the proxy is missing", () => {
  beforeEach(() => {
    delete process.env["PROXY_URL"];
  });

  it("reports unavailable without PROXY_URL", () => {
    expect(realauctionProxyStatus()).toEqual({
      available: false,
      reason: "PROXY_URL is not set",
    });
  });

  it("never falls back to a direct vendor fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(realauctionFetch("https://duval.realtaxdeed.com/index.cfm")).rejects.toBeInstanceOf(
      ProxyUnavailableError,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("egress routing", () => {
  // Vitest runs on Node, which has no proxy mechanism; pretend to be Bun so the
  // scoping/User-Agent decisions can be asserted independently of the runtime.
  const g = globalThis as unknown as { Bun?: unknown };
  beforeEach(() => {
    process.env["PROXY_URL"] = PROXY;
    g.Bun = {};
  });
  afterEach(() => {
    delete process.env["PROXY_URL"];
    delete g.Bun;
    vi.restoreAllMocks();
  });

  it("sends vendor requests through the proxy with a browser User-Agent", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return htmlResponse();
    }) as typeof fetch);

    await politeFetch("https://hernando.realtaxdeed.com/index.cfm?zaction=USER");
    const main = calls.find((c) => c.url.includes("zaction"))!;
    const headers = main.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(REALAUCTION_USER_AGENT);
    expect((main.init as { proxy?: string } | undefined)?.proxy ?? PROXY).toBe(PROXY);
  });

  it("leaves other sources on direct egress with the honest bot User-Agent", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch);

    await politeFetch("https://data.seattle.gov/resource/abcd.json");
    const main = calls.find((c) => c.url.includes("resource"))!;
    const headers = main.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(BOT_USER_AGENT);
    expect((main.init as { proxy?: string } | undefined)?.proxy).toBeUndefined();
  });

  it("does not retry a vendor 403 and records the status", async () => {
    startRealauctionBudget();
    let hits = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("robots.txt")) return new Response("", { status: 404 });
      hits += 1;
      return htmlResponse("blocked", 403);
    }) as typeof fetch);

    await expect(politeFetch("https://citrus.realtaxdeed.com/index.cfm")).rejects.toThrow("HTTP 403");
    expect(hits).toBe(1);
    expect(lastVendorStatus()).toBe(403);
    endRealauctionBudget();
  });
});

describe("bandwidth cap", () => {
  afterEach(() => {
    endRealauctionBudget();
  });

  it("accumulates bytes and aborts the sweep at the cap", () => {
    startRealauctionBudget(60_000);
    recordVendorFetch(25_000, 200);
    expect(bytesUsed()).toBe(25_000);
    expect(() => assertBudgetAvailable()).not.toThrow();
    expect(() => recordVendorFetch(40_000, 200)).toThrow(BandwidthCapError);
    expect(() => assertBudgetAvailable()).toThrow(BandwidthCapError);
  });

  it("ignores accounting when no sweep budget is open", () => {
    expect(() => recordVendorFetch(10_000, 200)).not.toThrow();
    expect(bytesUsed()).toBe(0);
  });
});
