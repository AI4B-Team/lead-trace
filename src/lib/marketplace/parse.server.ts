/**
 * Turns a plain-English marketplace request into structured criteria.
 *
 * The output shape is intentionally category-agnostic: shared shopping fields
 * plus a flat `attributes` bag, so a new category needs a label list only
 * (see CATEGORY_ATTRIBUTES) and never a schema change here.
 */
import {
  CATEGORY_ATTRIBUTES, EMPTY_CRITERIA, MARKETPLACE_CATEGORIES,
  type MarketplaceCategory, type MarketplaceCriteria,
} from "./catalog.shared";

export type ParsedRequest = {
  category: MarketplaceCategory;
  criteria: MarketplaceCriteria;
  location: string | null;
  radiusMiles: number | null;
  /** True when the model could not be reached; the UI then asks for manual entry. */
  degraded: boolean;
};

const CATEGORY_KEYS = MARKETPLACE_CATEGORIES.map((c) => c.key);

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
}

/** Local fallback so the flow still works when the model is unavailable. */
function heuristic(prompt: string, hinted: MarketplaceCategory | null): ParsedRequest {
  const criteria: MarketplaceCriteria = { ...EMPTY_CRITERIA, attributes: {} };
  const price = prompt.match(/under\s*\$?\s*([\d,]+)/i);
  if (price) criteria.priceMax = Number(price[1].replace(/,/g, ""));
  const radius = prompt.match(/(\d{1,3})\s*(?:mi|mile)/i);
  const years = prompt.match(/(19|20)\d{2}\s*[-–to]+\s*((19|20)\d{2})/i);
  if (years) {
    criteria.attributes.year_min = Number(years[0].slice(0, 4));
    criteria.attributes.year_max = Number(years[2]);
  }
  return {
    category: hinted ?? "other",
    criteria,
    location: null,
    radiusMiles: radius ? Number(radius[1]) : null,
    degraded: true,
  };
}

export async function parseRequest(
  prompt: string,
  hintedCategory: MarketplaceCategory | null,
): Promise<ParsedRequest> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return heuristic(prompt, hintedCategory);

  const attributeHint = Object.entries(CATEGORY_ATTRIBUTES)
    .map(([cat, attrs]) => `${cat}: ${attrs.map((a) => a.key).join(", ")}`)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        reasoning: { enabled: false },
        messages: [
          {
            role: "system",
            content:
              "You convert a shopper's plain-English marketplace request into structured search criteria. " +
              `Pick one category from: ${CATEGORY_KEYS.join(", ")}. ` +
              "Common attribute keys per category (use these when they fit, add snake_case keys when they don't):\n" +
              attributeHint +
              "\nNever guess why the person wants the item and never invent facts they did not state. " +
              'Return JSON only: {"category":"...","targets":["..."],"price_min":null,"price_max":null,' +
              '"attributes":{"key":"value"},"keywords":["..."],"exclusions":["..."],' +
              '"location":null,"radius_miles":null}. ' +
              "targets are the specific things sought (e.g. \"Toyota Camry\"). radius_miles is a number, or null for nationwide/unspecified.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return heuristic(prompt, hintedCategory);
  }
  if (!res.ok) return heuristic(prompt, hintedCategory);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return heuristic(prompt, hintedCategory);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return heuristic(prompt, hintedCategory);
  }

  const cat = String(parsed.category ?? "");
  const category = (CATEGORY_KEYS as string[]).includes(cat)
    ? (cat as MarketplaceCategory)
    : (hintedCategory ?? "other");

  const attributes: Record<string, string | number> = {};
  const rawAttrs = parsed.attributes;
  if (rawAttrs && typeof rawAttrs === "object") {
    for (const [k, v] of Object.entries(rawAttrs as Record<string, unknown>)) {
      if (v === null || v === undefined || v === "") continue;
      const key = k.trim().toLowerCase().replace(/\s+/g, "_");
      attributes[key] = typeof v === "number" ? v : String(v);
    }
  }

  return {
    category,
    criteria: {
      targets: strings(parsed.targets),
      priceMin: num(parsed.price_min),
      priceMax: num(parsed.price_max),
      keywords: strings(parsed.keywords),
      exclusions: strings(parsed.exclusions),
      attributes,
    },
    location: typeof parsed.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
    radiusMiles: num(parsed.radius_miles),
    degraded: false,
  };
}
