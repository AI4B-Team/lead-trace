// AI translation for the UI. Called by the language switcher; results are cached
// on the client in localStorage so each string is only ever paid for once.

const LANG_NAMES: Record<string, string> = {
  es: "Spanish", pt: "Portuguese (Brazil)", fr: "French", de: "German",
  it: "Italian", nl: "Dutch", pl: "Polish", sv: "Swedish", tr: "Turkish",
  ar: "Arabic", he: "Hebrew", ru: "Russian", zh: "Simplified Chinese",
  ja: "Japanese", ko: "Korean", hi: "Hindi", vi: "Vietnamese", th: "Thai",
  id: "Indonesian",
};

export function languageName(code: string) {
  return LANG_NAMES[code] ?? code;
}

export async function translateStrings(texts: string[], lang: string): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || texts.length === 0) return texts;

  const target = languageName(lang);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // UI strings: cheapest/fastest tier, no thinking needed.
      model: "google/gemini-3.1-flash-lite",
      reasoning: { enabled: false },
      messages: [
        {
          role: "system",
          content:
            `You are a UI localization engine. Translate each string from English into ${target}. ` +
            `Rules: keep the meaning and the capitalization style of the source (Title Case stays Title Case). ` +
            `Never translate the brand name "LeadTrace", product names, industry acronyms (SMS, DNC, TCPA, 10DLC, CRM, AI, API), ` +
            `numbers, currency, URLs, or emoji. Keep translations short so they fit buttons and labels. ` +
            `Return JSON only: {"items":["..."]} with exactly the same number of items, in the same order.`,
        },
        { role: "user", content: JSON.stringify({ items: texts }) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return texts;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return texts;
  try {
    const parsed = JSON.parse(content) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    if (items.length !== texts.length) return texts;
    return items.map((v, i) => (typeof v === "string" && v.trim() ? v : texts[i]));
  } catch {
    return texts;
  }
}
