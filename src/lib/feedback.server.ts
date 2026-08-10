/**
 * Server-only AI helper for the feedback dialog: rewrites a user's rough
 * notes into a crisp, actionable product request. Never throws.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.1-flash-lite";

const SYSTEM = `You rewrite messy product feedback for LeadTrace, a lead-generation and SMS outreach SaaS.
Rewrite the user's note as one concise, specific request in the user's own first-person voice.
Rules: keep their intent exactly, invent no features they did not imply, no greetings, no preamble,
no markdown, no quotes. 1-3 sentences maximum. Return only the rewritten feedback.`;

/** Returns a polished version of the note, or null when unavailable. */
export async function improveFeedback(body: string, category: string | null): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { enabled: false },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `${category ? `Category: ${category}\n` : ""}Raw note: ${body.slice(0, 2000)}`,
          },
        ],
      }),
    });
    if (res.status === 429) throw new Error("rate_limited");
    if (res.status === 402) throw new Error("credits_exhausted");
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (json.choices?.[0]?.message?.content ?? "").trim().replace(/^["“]|["”]$/g, "");
    return text || null;
  } catch (e) {
    if (e instanceof Error && (e.message === "rate_limited" || e.message === "credits_exhausted")) throw e;
    return null;
  }
}