/**
 * Server-only AI helpers for the Conversations workspace: conversation
 * summaries and suggested replies. Never throws — callers degrade gracefully.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Latency matters more than depth here: these are short summaries and 300-char
// SMS drafts. Flash-Lite with thinking disabled answers in ~1s instead of ~10s.
const MODEL = "google/gemini-3.1-flash-lite";

type Turn = { role: "user" | "assistant"; content: string };

async function chat(system: string, user: string, maxTokens = 400): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // No chain-of-thought for these tasks — it is pure added latency.
        reasoning: { enabled: false },
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 429) throw new Error("rate_limited");
    if (res.status === 402) throw new Error("credits_exhausted");
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (json.choices?.[0]?.message?.content ?? "").trim() || null;
  } catch (e) {
    if (e instanceof Error && (e.message === "rate_limited" || e.message === "credits_exhausted")) throw e;
    return null;
  }
}

function transcript(turns: Turn[]): string {
  return turns
    .map((t) => `${t.role === "user" ? "Lead" : "Us"}: ${t.content}`)
    .join("\n")
    .slice(-4000);
}

export type ConversationSummary = {
  bullets: string[];
  nextStep: string | null;
};

/** Three short factual bullets plus a recommended next step. */
export async function summarizeConversation(turns: Turn[]): Promise<ConversationSummary | null> {
  if (!turns.length) return null;
  const out = await chat(
    [
      "You summarize SMS sales conversations for a sales rep.",
      "Reply with 2-4 short bullet lines starting with '- ', then a final line starting with 'NEXT: '.",
      "Each bullet must be under 60 characters, factual, no fluff, no greetings.",
      "The NEXT line is the single best next action, under 80 characters.",
      "Never invent facts that are not in the transcript.",
    ].join("\n"),
    transcript(turns),
    220,
  );
  if (!out) return null;
  const bullets: string[] = [];
  let nextStep: string | null = null;
  for (const raw of out.split("\n").map((l) => l.trim())) {
    if (/^next:/i.test(raw)) nextStep = raw.replace(/^next:\s*/i, "").trim();
    else if (raw.startsWith("-") || raw.startsWith("•")) bullets.push(raw.replace(/^[-•]\s*/, "").trim());
  }
  if (!bullets.length && !nextStep) return null;
  return { bullets: bullets.slice(0, 4), nextStep };
}

export type ReplySuggestion = { tone: string; body: string };

const TONES: Array<{ tone: string; guidance: string }> = [
  { tone: "Friendly", guidance: "warm, casual, human, first-name energy" },
  { tone: "Professional", guidance: "polished, concise, businesslike" },
  { tone: "Sales Focused", guidance: "moves toward a call or appointment with a clear ask" },
];

const COMMAND_GUIDANCE: Record<string, string> = {
  "/friendly": "Rewrite warmly and casually.",
  "/professional": "Rewrite in a polished, businesslike tone.",
  "/pricing": "Answer the pricing question without quoting exact numbers; ask for the detail needed to price it.",
  "/qualify": "Ask the single most useful qualifying question.",
  "/followup": "Send a short, low-pressure follow-up nudge.",
  "/rebook": "Offer two specific new time options.",
  "/close": "Ask directly for a short appointment.",
};

/**
 * Three tone-varied replies grounded only in the transcript and brand context.
 */
export async function suggestReplies(opts: {
  turns: Turn[];
  brand?: string | null;
  product?: string | null;
  command?: string | null;
  draft?: string | null;
}): Promise<ReplySuggestion[]> {
  const context = [
    opts.brand ? `Business: ${opts.brand}` : "",
    opts.product ? `What we offer: ${opts.product}` : "",
    opts.command ? `Operator instruction: ${COMMAND_GUIDANCE[opts.command] ?? opts.command}` : "",
    opts.draft ? `Operator draft to improve:\n${opts.draft}` : "",
    `Transcript:\n${transcript(opts.turns)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const results = await Promise.all(
    TONES.map(async ({ tone, guidance }) => {
      const body = await chat(
        [
          "You draft the next outbound SMS reply for a sales rep.",
          `Tone: ${guidance}.`,
          "Under 300 characters. Plain text. No emojis, no links, no signatures, no quotes around the message.",
          "Never promise pricing, approval, or outcomes. If a specific you do not know is requested, ask for the detail you need.",
          "Output only the message text.",
        ].join("\n"),
        context,
        160,
      );
      return body ? { tone, body: body.replace(/^["']|["']$/g, "").slice(0, 320) } : null;
    }),
  );
  return results.filter((r): r is ReplySuggestion => !!r);
}
