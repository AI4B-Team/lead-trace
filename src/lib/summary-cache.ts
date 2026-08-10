// Session-local cache for Inbox AI summaries. A summary is deterministic for a
// given thread + message count, so re-opening a conversation should paint the
// summary instantly instead of waiting on another model call.
export type CachedSummary = { bullets: string[]; nextStep: string | null } | null;

const key = (threadKey: string, msgCount: number) =>
  `leadtrace_thread_summary:${threadKey}:${msgCount}`;

export function readSummary(threadKey: string, msgCount: number): CachedSummary | undefined {
  try {
    const raw = sessionStorage.getItem(key(threadKey, msgCount));
    if (!raw) return undefined;
    return JSON.parse(raw) as CachedSummary;
  } catch {
    return undefined;
  }
}

export function writeSummary(threadKey: string, msgCount: number, summary: CachedSummary) {
  try {
    sessionStorage.setItem(key(threadKey, msgCount), JSON.stringify(summary));
  } catch {
    /* ignore */
  }
}