/**
 * Canonical pipeline vocabulary (spec §23) — the single source of truth for
 * stage names and order on every surface: jobs table, job detail, dashboard,
 * and exports. Full words only, never truncated labels.
 *
 * Found → Deduped → Mobile Verified → Skip Traced → Scrubbed → Clean
 *
 * "Leads" is reserved for the deduplicated Leads library. Job-level raw
 * counts are always called "Rows Processed".
 */
export const PIPELINE_STAGE_KEYS = [
  "found",
  "deduped",
  "verified",
  "skipTraced",
  "scrubbed",
  "clean",
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGE_KEYS)[number];

export const PIPELINE_STAGE_LABEL: Record<PipelineStageKey, string> = {
  found: "Found",
  deduped: "Deduped",
  verified: "Mobile Verified",
  skipTraced: "Skip Traced",
  scrubbed: "Scrubbed",
  clean: "Clean",
};

export type PipelineStageCounts = Record<PipelineStageKey, number>;

/** Job-level raw record count label (§23). Never "Leads". */
export const ROWS_PROCESSED_LABEL = "Rows Processed";

/**
 * Build canonical stage counts from a job row. Each stage is clamped so the
 * funnel never widens further down the pipeline — the story is always a drop.
 */
export function buildPipelineStages(job: {
  rows_in?: number | null;
  rows_deduped?: number | null;
  rows_enriched?: number | null;
  rows_skiptraced?: number | null;
  counts: { clean: number; dnc: number; litigator: number };
}): PipelineStageCounts {
  const found = job.rows_in ?? 0;
  const scrubbedTotal = job.counts.clean + job.counts.dnc + job.counts.litigator;
  const deduped = clamp(job.rows_deduped ?? scrubbedTotal, found);
  const verified = clamp(job.rows_enriched ?? scrubbedTotal, deduped);
  const skipTraced = clamp(job.rows_skiptraced ?? scrubbedTotal, verified);
  const scrubbed = clamp(scrubbedTotal, skipTraced || verified);
  const clean = clamp(job.counts.clean, scrubbed);
  return { found, deduped, verified, skipTraced, scrubbed, clean };
}

function clamp(value: number, ceiling: number) {
  const v = Math.max(0, value || 0);
  return ceiling > 0 ? Math.min(v, ceiling) : v;
}
