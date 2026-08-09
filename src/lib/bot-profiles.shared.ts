// Template-scoped bot profiles ("product pipelines").
//
// A profile changes WHAT the AI says, never WHICH number or brand it says it
// from. Sender identity (10DLC brand, number provisioning, assertCanText) is
// entirely untouched by anything in this file.
//
// Everything here is pure so the resolution order and the prompt assembly can
// be unit-tested without a database.

import { z } from "zod";

export const PROFILE_TEMPLATES = [
  "distress_feed",
  "google_maps",
  "zillow_fsbo",
  "street_scan",
  "contact_scraper",
  "upload",
] as const;

export type ProfileTemplate = (typeof PROFILE_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<string, string> = {
  distress_feed: "Distress Feed",
  google_maps: "Local Businesses",
  zillow_fsbo: "FSBO & Agents",
  street_scan: "Street Scan",
  contact_scraper: "Contact Scraper",
  upload: "Uploaded Lists",
};

export const objectionSchema = z.object({
  trigger: z.string().max(200).default(""),
  approved_response: z.string().max(600).default(""),
});

export const faqSchema = z.object({ q: z.string().max(300), a: z.string().max(600) });

export const botProfileSchema = z.object({
  id: z.string().uuid().optional(),
  workspace_id: z.string().uuid().nullable().optional(),
  template_id: z.string().max(60).nullable().default(null),
  record_type: z.string().max(80).nullable().default(null),
  name: z.string().min(1).max(120),
  is_default: z.boolean().default(false),
  opener: z.string().min(1).max(1200),
  context_framing: z.string().max(1500).nullable().default(null),
  objections: z.array(objectionSchema).max(40).default([]),
  screening_questions: z.array(z.string().max(240)).max(20).default([]),
  faqs: z.array(faqSchema).max(40).default([]),
  tone: z.string().max(240).nullable().default(null),
  escalation_triggers: z.array(z.string().max(120)).max(40).default([]),
  banned_topics: z.array(z.string().max(120)).max(40).default([]),
  dispositions: z.array(z.string().max(60)).max(30).default([]),
  default_campaign_id: z.string().uuid().nullable().default(null),
});

export type BotProfile = z.infer<typeof botProfileSchema>;

/** Where a lead came from, used to pick a profile. */
export type LeadScope = { templateId: string | null; recordType: string | null };

export class ProfileResolutionError extends Error {
  constructor(scope: LeadScope) {
    super(
      `No Bot Profile Resolved For template=${scope.templateId ?? "none"} record_type=${
        scope.recordType ?? "none"
      }`,
    );
    this.name = "ProfileResolutionError";
  }
}

export type ResolvedProfile = {
  profile: BotProfile;
  /** Which rule matched, surfaced in the UI and the lead detail page. */
  matched: "template_record_type" | "template" | "workspace_default" | "platform_default";
};

/**
 * First hit wins. There is deliberately NO final fallback to "no profile" — an
 * unresolvable lead is an error, not a silent generic persona.
 */
export function resolveBotProfile(candidates: BotProfile[], scope: LeadScope): ResolvedProfile {
  const workspaceRows = candidates.filter((p) => p.workspace_id);
  const platformRows = candidates.filter((p) => !p.workspace_id);
  const t = scope.templateId;
  const rt = scope.recordType;

  if (t && rt) {
    const exact = workspaceRows.find((p) => p.template_id === t && p.record_type === rt);
    if (exact) return { profile: exact, matched: "template_record_type" };
  }
  if (t) {
    const byTemplate = workspaceRows.find((p) => p.template_id === t && !p.record_type);
    if (byTemplate) return { profile: byTemplate, matched: "template" };
  }
  const wsDefault = workspaceRows.find((p) => p.is_default);
  if (wsDefault) return { profile: wsDefault, matched: "workspace_default" };

  if (t && rt) {
    const platExact = platformRows.find((p) => p.template_id === t && p.record_type === rt);
    if (platExact) return { profile: platExact, matched: "platform_default" };
  }
  if (t) {
    const plat = platformRows.find((p) => p.template_id === t && !p.record_type);
    if (plat) return { profile: plat, matched: "platform_default" };
  }
  throw new ProfileResolutionError(scope);
}

// ---------------------------------------------------------------------------
// Categorical escalation. Some question TYPES always route to a human, no
// matter how well the model could answer them. These are additive to the
// platform guardrails and cannot relax them.
// ---------------------------------------------------------------------------

export const CATEGORICAL_ESCALATION: Record<string, string[]> = {
  real_estate: [
    "legal advice of any kind",
    "tax consequences of a sale",
    "title, lien, or ownership questions",
    "anything about the specific foreclosure, probate, or court process",
  ],
  insurance: [
    "coverage questions",
    "underwriting decisions",
    "eligibility or qualification",
    "anything that requires a licensed agent",
  ],
  home_services: [
    "binding quotes or firm pricing",
    "warranty terms",
    "code compliance claims",
  ],
};

/** Which categorical set a profile inherits, inferred from its template. */
export function escalationCategoryForTemplate(templateId: string | null): keyof typeof CATEGORICAL_ESCALATION | null {
  switch (templateId) {
    case "distress_feed":
    case "zillow_fsbo":
    case "street_scan":
      return "real_estate";
    case "google_maps":
      return "home_services";
    default:
      return null;
  }
}

/** The profile persona block of the system prompt. */
export function buildProfileSection(profile: BotProfile, category?: keyof typeof CATEGORICAL_ESCALATION | null): string {
  const cat = category === undefined ? escalationCategoryForTemplate(profile.template_id) : category;
  const categorical = cat ? CATEGORICAL_ESCALATION[cat] ?? [] : [];
  const lines: string[] = [
    `PROFILE: ${profile.name}`,
    profile.tone ? `Tone: ${profile.tone}` : "",
    profile.context_framing ? `Why you are reaching out: ${profile.context_framing}` : "",
    `Approved opener / framing (adapt, never contradict): ${profile.opener}`,
  ];
  if (profile.objections.length) {
    lines.push(
      "Approved objection handling (use these answers, do not improvise around them):",
      ...profile.objections
        .filter((o) => o.approved_response)
        .map((o) => `- ${o.trigger ? `When they say "${o.trigger}": ` : ""}${o.approved_response}`),
    );
  }
  if (profile.screening_questions.length) {
    lines.push(
      "Screening questions, one at a time, in this order:",
      ...profile.screening_questions.map((q) => `- ${q}`),
    );
  }
  if (profile.faqs.length) {
    lines.push(
      "Approved FAQ answers (answer ONLY from these):",
      ...profile.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`),
    );
  }
  if (categorical.length || profile.banned_topics.length) {
    lines.push(
      "ABSOLUTE NO-ANSWER TOPICS. You do not answer these. You say you will have someone who handles that follow up, and you hand off:",
      ...[...categorical, ...profile.banned_topics].map((t) => `- ${t}`),
    );
  }
  if (profile.escalation_triggers.length) {
    lines.push(
      "Hand off immediately if any of these come up:",
      ...profile.escalation_triggers.map((t) => `- ${t}`),
    );
  }
  if (profile.dispositions.length) {
    lines.push(`Outcomes this conversation can end in: ${profile.dispositions.join(", ")}.`);
  }
  return lines.filter(Boolean).join("\n");
}

/** Profile-supplied escalation phrases, matched literally and case-insensitively. */
export function profileEscalation(profile: BotProfile, message: string): string | null {
  const hay = message.toLowerCase();
  for (const trigger of profile.escalation_triggers) {
    const t = trigger.trim().toLowerCase();
    if (t && hay.includes(t)) return "profile_escalation_trigger";
  }
  for (const topic of profile.banned_topics) {
    const t = topic.trim().toLowerCase();
    if (t && hay.includes(t)) return "profile_banned_topic";
  }
  return null;
}
