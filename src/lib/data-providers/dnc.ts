import { DncUnavailableError, type DncScrubber, type ScrubResult, type ScrubStatus } from "./index";
import { isRpvConfigured, rpvScrub } from "./rpv";

// DNC + litigator scrubber abstraction. Two providers, in priority order:
//   1. RealPhoneValidation (native adapter) when RPV_API_TOKEN is set.
//   2. A generic POST { phones } → { results } endpoint when DNC_API_URL +
//      DNC_API_KEY are set (works with a thin proxy in front of any vendor).
//
// FAIL-CLOSED CONTRACT: if no provider is configured, or the provider errors,
// this module THROWS. It never invents a clean/dnc split, and there is no
// development fallback — a scrub either happened or it didn't.

async function httpScrub(url: string, apiKey: string, phones: string[]): Promise<ScrubResult> {
  // Generic contract: POST { phones: string[] } → { results: [{ phone, dnc, litigator }] }
  // Works with a thin proxy in front of BlacklistAlliance / RealPhoneValidation.
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ phones }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DNC scrub failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    results: Array<{ phone: string; dnc?: boolean; litigator?: boolean }>;
    proof?: Record<string, unknown>;
  };
  const results = body.results.map((r) => {
    let status: ScrubStatus = "clean";
    if (r.litigator) status = "litigator";
    else if (r.dnc) status = "dnc";
    return { phone: r.phone, status };
  });
  return {
    provider: new URL(url).hostname,
    results,
    proof: body.proof ?? { source: url, count: phones.length, scrubbed_at: new Date().toISOString() },
  };
}

export function getDncScrubber(): DncScrubber {
  return {
    key: isRpvConfigured() ? "dnc.rpv" : "dnc.http",
    isConfigured() {
      return isRpvConfigured() || Boolean(process.env.DNC_API_URL && process.env.DNC_API_KEY);
    },
    async scrub(phones) {
      const url = process.env.DNC_API_URL;
      const apiKey = process.env.DNC_API_KEY;
      if (phones.length === 0) {
        return {
          provider: isRpvConfigured() ? "realphonevalidation" : url ? new URL(url).hostname : "none",
          results: [],
          proof: { count: 0, scrubbed_at: new Date().toISOString() },
        };
      }
      if (isRpvConfigured()) {
        return rpvScrub(phones);
      }
      if (!url || !apiKey) {
        throw new DncUnavailableError(
          "DNC and litigator scrubbing is not configured. Add RPV_API_TOKEN (RealPhoneValidation) before any list is scrubbed or sent.",
        );
      }
      try {
        return await httpScrub(url, apiKey, phones);
      } catch (err) {
        // Deliberately NO mock fallback: a scrub that did not happen must
        // never look like a scrub that came back clean.
        console.error("[dnc] scrub failed — failing closed:", err);
        throw new DncUnavailableError(
          `DNC and litigator scrubbing could not be completed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}