// Server-side profile resolution. Sender identity is untouched here: this only
// decides which conversation copy the AI is given.

import {
  resolveBotProfile,
  botProfileSchema,
  type BotProfile,
  type LeadScope,
  type ResolvedProfile,
} from "./bot-profiles.shared";

type Db = { from: (t: string) => any };

const COLUMNS =
  "id, workspace_id, template_id, record_type, name, is_default, opener, context_framing, objections, screening_questions, faqs, tone, escalation_triggers, banned_topics, dispositions, default_campaign_id";

function coerce(row: Record<string, unknown>): BotProfile {
  return botProfileSchema.parse({
    ...row,
    objections: Array.isArray(row.objections) ? row.objections : [],
    screening_questions: Array.isArray(row.screening_questions) ? row.screening_questions : [],
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
  });
}

/** Every profile that could apply: the workspace's own plus platform defaults. */
export async function loadProfileCandidates(db: Db, workspaceId: string): Promise<BotProfile[]> {
  const { data, error } = await db
    .from("bot_profiles")
    .select(COLUMNS)
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => coerce(r));
}

/** Where a lead came from: the job that produced it carries template + record type. */
export async function leadScope(db: Db, leadId: string | null): Promise<LeadScope> {
  if (!leadId) return { templateId: null, recordType: null };
  const { data: lead } = await db.from("leads").select("job_id").eq("id", leadId).maybeSingle();
  if (!lead?.job_id) return { templateId: null, recordType: null };
  const { data: job } = await db
    .from("jobs")
    .select("record_type, source_type, params")
    .eq("id", lead.job_id)
    .maybeSingle();
  if (!job) return { templateId: null, recordType: null };
  const params = (job.params ?? {}) as { templateId?: string | null };
  return {
    templateId: params.templateId ?? (job.source_type === "upload" ? "upload" : null),
    recordType: job.record_type || null,
  };
}

/**
 * Resolve the profile for one lead. Throws when nothing resolves — a silent
 * generic persona is not an acceptable fallback.
 */
export async function resolveProfileForLead(
  db: Db,
  opts: { workspaceId: string; leadId: string | null },
): Promise<ResolvedProfile> {
  const [candidates, scope] = await Promise.all([
    loadProfileCandidates(db, opts.workspaceId),
    leadScope(db, opts.leadId),
  ]);
  return resolveBotProfile(candidates, scope);
}
