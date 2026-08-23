/**
 * AI extraction — used ONLY for what deterministic parsing could not resolve.
 *
 * The model is asked to read the listing, not to reason about value. It may
 * return `null` for anything the listing does not state; a null is kept as an
 * absent attribute so the matcher reports `unknown` instead of inventing a fact.
 */
import type { MarketplaceCategory } from "./catalog.shared";
import { EXTRACTION_FIELDS } from "./extract.shared";
import type { ExtractedAttributes, ExtractionConfidence, SellerSignal } from "./match.shared";

const MODEL = "google/gemini-3.1-flash-lite";

export type AiExtraction = {
  attributes: ExtractedAttributes;
  sellerSignals: SellerSignal[];
  /** True when the model could not be reached — callers must not fake results. */
  degraded: boolean;
};

function confidenceOf(v: unknown): ExtractionConfidence {
  const s = String(v ?? "").toLowerCase();
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

/**
 * @param needKeys attribute keys still unresolved after deterministic parsing.
 *                 Passing an empty list is a no-op, keeping cost at zero.
 */
export async function extractWithAi(input: {
  category: MarketplaceCategory;
  title: string;
  description: string | null;
  needKeys: string[];
}): Promise<AiExtraction> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const fields = input.needKeys.length
    ? input.needKeys
    : (EXTRACTION_FIELDS[input.category] ?? []);
  if (!apiKey || !fields.length) {
    return { attributes: {}, sellerSignals: [], degraded: !apiKey };
  }

  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { enabled: false },
        messages: [
          {
            role: "system",
            content:
              "You extract facts from a single online marketplace listing. " +
              "Only report what the listing text actually states. " +
              "If a field is not stated, return null for it — never guess, never infer from typical listings. " +
              `Extract these fields for a ${input.category} listing: ${fields.join(", ")}. ` +
              "Also list neutral seller-language signals you can quote evidence for " +
              "(urgency, availability, condition disclosures, willingness to consider offers, missing information). " +
              "Do NOT describe the seller's psychology, motivation, desperation or personality. " +
              "Do NOT estimate market value, resale value or profit. " +
              'Return JSON only: {"attributes":{"key":{"value":<string|number|null>,"confidence":"high|medium|low"}},' +
              '"seller_signals":[{"key":"snake_case","label":"Short Title Case Label","evidence":"quote from listing"}]}',
          },
          {
            role: "user",
            content: `TITLE: ${input.title}\n\nDESCRIPTION:\n${input.description ?? "(none provided)"}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return { attributes: {}, sellerSignals: [], degraded: true };
  }
  if (!res.ok) return { attributes: {}, sellerSignals: [], degraded: true };

  let parsed: Record<string, unknown>;
  try {
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { attributes: {}, sellerSignals: [], degraded: true };
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { attributes: {}, sellerSignals: [], degraded: true };
  }

  const attributes: ExtractedAttributes = {};
  const rawAttrs = parsed.attributes;
  if (rawAttrs && typeof rawAttrs === "object") {
    for (const [key, raw] of Object.entries(rawAttrs as Record<string, unknown>)) {
      const cell = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : { value: raw };
      const value = cell.value;
      // null / "" / "unknown" all mean the seller did not say — stay silent.
      if (value == null) continue;
      const s = typeof value === "number" ? value : String(value).trim();
      if (s === "" || (typeof s === "string" && /^(unknown|n\/a|not specified|none)$/i.test(s))) {
        continue;
      }
      attributes[key] = { value: s, confidence: confidenceOf(cell.confidence) };
    }
  }

  const sellerSignals: SellerSignal[] = [];
  const rawSignals = parsed.seller_signals;
  if (Array.isArray(rawSignals)) {
    for (const raw of rawSignals.slice(0, 8)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const label = String(r.label ?? "").trim();
      if (!label) continue;
      sellerSignals.push({
        key: String(r.key ?? label).trim().toLowerCase().replace(/\s+/g, "_"),
        label,
        evidence: r.evidence ? String(r.evidence).slice(0, 240) : null,
      });
    }
  }

  return { attributes, sellerSignals, degraded: false };
}
