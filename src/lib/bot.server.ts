// AI Warm-Up Bot — QUALIFIER, NOT CLOSER.
//
// Guardrails are enforced in CODE, not just in the prompt:
//  1. Opt-out / HELP is intercepted at the platform level BEFORE this module is
//     ever called (see the inbound webhook). The bot can never see, rebut, or
//     talk past an opt-out.
//  2. Regulated verticals: any price / coverage / medical / legal / financial
//     ask hands off to a human, no matter what the operator trained.
//  3. Guarantee language, legal threats, distress, and "talk to a person"
//     requests all force a handoff.
//  4. Anything outside the approved knowledge base hands off.

export type BotConfig = {
  vertical?: string;
  product?: string;
  tone?: string;
  faqs?: Array<{ q: string; a: string }>;
  approved_responses?: string[];
  screening_questions?: string[];
  booking_link?: string;
};

export type BotOutcome =
  | { action: "reply"; body: string }
  | { action: "handoff"; reason: string };

const HANDOFF_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(talk|speak|chat)\s+(to|with)\s+(a\s+)?(human|person|agent|rep|someone|manager)\b/i, reason: "human_requested" },
  { re: /\b(lawyer|attorney|sue|suing|lawsuit|litigation|report you|fcc|attorney general)\b/i, reason: "legal_threat" },
  { re: /\b(complaint|harass|harassment|scam|fraud|spam)\b/i, reason: "complaint" },
  { re: /\b(suicide|kill myself|emergency|911|dying|hospice)\b/i, reason: "distress" },
];

const REGULATED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(price|pricing|cost|quote|rate|premium|apr|interest rate|monthly payment|how much)\b/i, reason: "regulated_pricing" },
  { re: /\b(coverage|deductible|policy limits|plan|benefits|copay|claim)\b/i, reason: "regulated_coverage" },
  { re: /\b(diagnos|symptom|prescription|medication|treatment|doctor)\b/i, reason: "regulated_medical" },
  { re: /\b(credit score|loan|refinance|approval|qualify|underwrit|invest)\b/i, reason: "regulated_financial" },
  { re: /\b(legal advice|contract|liability|settlement)\b/i, reason: "regulated_legal" },
];

const BANNED_OUTPUT = /\b(guarantee[d]?|you qualify|approved|no risk|risk[- ]free|best price|cheapest|lowest rate|100%)\b/i;

import type { BotProfile } from "./bot-profiles.shared";
import { buildProfileSection, profileEscalation } from "./bot-profiles.shared";

/** Deterministic pre-checks. Returns a handoff reason, or null to continue. */
export function preCheckHandoff(message: string, regulated: boolean, profile?: BotProfile | null): string | null {
  for (const p of HANDOFF_PATTERNS) if (p.re.test(message)) return p.reason;
  if (regulated) {
    for (const p of REGULATED_PATTERNS) if (p.re.test(message)) return p.reason;
  }
  // Profiles are ADDITIVE ONLY: they run after the platform patterns and can
  // only make the bot more cautious, never less.
  if (profile) {
    const extra = profileEscalation(profile, message);
    if (extra) return extra;
  }
  return null;
}

export function buildSystemPrompt(
  cfg: BotConfig,
  regulated: boolean,
  knowledge?: string,
  profile?: BotProfile | null,
  recordContext?: string | null,
) {
  const faqs = (cfg.faqs ?? []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n");
  const approved = (cfg.approved_responses ?? []).map((a) => `- ${a}`).join("\n");
  const screening = (cfg.screening_questions ?? []).map((s) => `- ${s}`).join("\n");
  return [
    // 1. Platform guardrails. Never overridable by a profile.
    "You are a friendly SMS warm-up assistant whose ONLY job is to qualify an interested lead and hand off to a human. You are NOT a closer.",
    `Industry / vertical: ${cfg.vertical || "general"}`,
    `What is offered: ${cfg.product || "not specified"}`,
    `Tone: ${cfg.tone || "warm, brief, human, no hype"}`,
    knowledge ? `Approved brand knowledge base (treat as source of truth, answer ONLY from it):\n${knowledge}` : "",
    faqs ? `Approved FAQ answers (answer ONLY from these):\n${faqs}` : "",
    approved ? `Approved responses:\n${approved}` : "",
    screening ? `Screening questions to work through, one at a time:\n${screening}` : "",
    cfg.booking_link ? `Booking link you may share once the lead is interested: ${cfg.booking_link}` : "",
    "HARD RULES:",
    "- Keep replies under 320 characters, plain text, no emojis, no links except the booking link.",
    "- Answer ONLY from the approved material above plus safe small talk. Never invent facts.",
    "- Never make guarantees, promises of approval, or claims about outcomes.",
    regulated
      ? "- This is a REGULATED vertical. Never discuss price, coverage, plans, medical, legal, or financial specifics. Hand off instead."
      : "- If asked for specifics you do not have, hand off instead of guessing.",
    '- If you cannot answer safely from the approved material, reply with exactly: HANDOFF',
    // 2. Profile persona.
    profile ? `\n--- CONVERSATION PROFILE ---\n${buildProfileSection(profile)}` : "",
    // 3. Record context. Case facts outrank profile copy on matters of fact.
    recordContext
      ? `\n--- RECORD CONTEXT (facts about this lead) ---\n${recordContext}\nThese facts outrank the profile copy above. Never state anything about this lead's situation that these facts do not support, even if the profile copy suggests it.`
      : "",
  ].filter(Boolean).join("\n");
}

/** Generate a bot reply, or decide to hand off. Never throws. */
export async function generateBotReply(opts: {
  message: string;
  config: BotConfig;
  regulated: boolean;
  knowledge?: string;
  profile?: BotProfile | null;
  recordContext?: string | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<BotOutcome> {
  const pre = preCheckHandoff(opts.message, opts.regulated, opts.profile ?? null);
  if (pre) return { action: "handoff", reason: pre };

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { action: "handoff", reason: "bot_unavailable" };

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(
              opts.config,
              opts.regulated,
              opts.knowledge,
              opts.profile ?? null,
              opts.recordContext ?? null,
            ),
          },
          ...(opts.history ?? []),
          { role: "user", content: opts.message },
        ],
      }),
    });
    if (!res.ok) return { action: "handoff", reason: "bot_unavailable" };
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!text || /^HANDOFF\b/i.test(text)) return { action: "handoff", reason: "outside_approved_answers" };
    if (BANNED_OUTPUT.test(text)) return { action: "handoff", reason: "unsafe_claim_blocked" };
    // Post-check the generated text against regulated topics too.
    if (opts.regulated) {
      for (const p of REGULATED_PATTERNS) if (p.re.test(text)) return { action: "handoff", reason: p.reason };
    }
    return { action: "reply", body: text.slice(0, 320) };
  } catch {
    return { action: "handoff", reason: "bot_error" };
  }
}