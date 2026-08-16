// Daily compliance digest.
//
// The compliance record itself (/app/compliance) stays the immutable, exportable
// system of record. This job only writes ORIENTATION: one rollup notification +
// one activity row per workspace that had compliance events in the window, so
// operators notice DNC hits and quiet-hours blocks without reading the log.

const WINDOW_HOURS = 24;

/** Human label for a raw compliance reason key. */
function reasonLabel(reason: string): string {
  return reason
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export async function runComplianceDigest(): Promise<{
  workspaces: number;
  events: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logActivity } = await import("./activity.server");

  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const { fetchAllPages } = await import("./pg-page.server");
  // A single select is capped at 1000 rows, so busy days silently undercounted
  // the digest — page through the window instead.
  const rows = (await fetchAllPages(
    (from, to) =>
      supabaseAdmin
        .from("compliance_events")
        .select("workspace_id, reason, path")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .range(from, to),
    20_000,
  )) as Array<{ workspace_id: string; reason: string; path: string | null }>;
  const byWorkspace = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.workspace_id) continue;
    const counts = byWorkspace.get(row.workspace_id) ?? new Map<string, number>();
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
    byWorkspace.set(row.workspace_id, counts);
  }

  for (const [workspaceId, counts] of byWorkspace) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const breakdown = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([reason, n]) => `${reasonLabel(reason)}: ${n}`)
      .join(" · ");
    const summary = `${total} Compliance ${total === 1 ? "Event" : "Events"} In The Last 24 Hours`;

    try {
      await supabaseAdmin.from("notifications").insert({
        workspace_id: workspaceId,
        kind: "compliance_digest",
        title: "Compliance Digest",
        body: `${summary} — ${breakdown}`,
      } as never);
    } catch {
      /* the compliance log remains the record */
    }
    await logActivity(supabaseAdmin as never, workspaceId, {
      type: "compliance_digest",
      summary,
      detail: breakdown || null,
      refType: "compliance",
    });
  }

  return { workspaces: byWorkspace.size, events: rows.length };
}
