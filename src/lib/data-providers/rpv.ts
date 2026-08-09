// RealPhoneValidation DNC + litigator scrub adapter.
//
// Contract with the rest of the pipeline is FAIL-CLOSED: a phone we could not
// get a verdict for comes back "unknown" (never "clean"), and a provider that
// is unreachable throws DncUnavailableError so the run stops instead of
// texting an unscrubbed list.

import { DncUnavailableError, type ScrubResult, type ScrubStatus } from "./index";

const RPV_BASE = "https://api.realvalidation.com/rpvWebService/DNCScrub.php";
/** RPV is a per-phone GET API; keep a small concurrency window so we don't
 *  trip their rate limits on a 10k list. */
const CONCURRENCY = 6;

const digits = (p: string) => p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const yes = (v: unknown) => typeof v === "string" && /^(y|yes|true|1)$/i.test(v.trim());

type RpvBody = {
  national_dnc?: string;
  state_dnc?: string;
  dma?: string;
  litigator?: string;
  status?: string;
  error_text?: string;
};

/** One phone → one verdict. Network/HTTP failures bubble up to the caller. */
async function scrubOne(token: string, phone: string): Promise<ScrubStatus> {
  const ten = digits(phone);
  if (ten.length !== 10) return "unknown";
  const url = `${RPV_BASE}?output=json&phone=${encodeURIComponent(ten)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`RealPhoneValidation responded ${res.status}`);
  }
  const body = (await res.json()) as RpvBody;
  const status = (body.status ?? "").toLowerCase();
  // RPV reports credential/quota problems in-band with a 200. Treat those as a
  // provider outage for the whole run, not as a per-phone "unknown".
  if (status.includes("invalid") || status.includes("error") || body.error_text) {
    throw new Error(body.error_text ?? `RealPhoneValidation error: ${body.status ?? "unknown"}`);
  }
  if (yes(body.litigator)) return "litigator";
  if (yes(body.national_dnc) || yes(body.state_dnc) || yes(body.dma)) return "dnc";
  if (status === "ok" || status === "success") return "clean";
  return "unknown";
}

export function isRpvConfigured(): boolean {
  return Boolean(process.env.RPV_API_TOKEN);
}

export async function rpvScrub(phones: string[]): Promise<ScrubResult> {
  const token = process.env.RPV_API_TOKEN;
  if (!token) {
    throw new DncUnavailableError(
      "RealPhoneValidation is not connected. Add RPV_API_TOKEN before any list is scrubbed or sent.",
    );
  }
  const results: Array<{ phone: string; status: ScrubStatus }> = [];
  try {
    for (let i = 0; i < phones.length; i += CONCURRENCY) {
      const batch = phones.slice(i, i + CONCURRENCY);
      const verdicts = await Promise.all(batch.map((p) => scrubOne(token, p)));
      batch.forEach((phone, idx) => results.push({ phone, status: verdicts[idx] ?? "unknown" }));
    }
  } catch (err) {
    throw new DncUnavailableError(
      `RealPhoneValidation scrub could not be completed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    provider: "realphonevalidation",
    results,
    proof: {
      source: "api.realvalidation.com/DNCScrub",
      lists: ["federal_dnc", "state_dnc", "dma", "litigator"],
      count: phones.length,
      counts,
      scrubbed_at: new Date().toISOString(),
    },
  };
}