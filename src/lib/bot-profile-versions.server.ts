/**
 * Versioned bot instructions.
 *
 * The test this exists to pass: six months after a complaint, you can say
 * exactly what the bot was instructed to say on a given date, who changed it,
 * and — when the change came from an agent — who approved that proposal.
 *
 * Snapshots are append-only. Nothing in the app updates or deletes a version.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { from: (table: string) => any };

export type ChangeKind = "create" | "edit" | "duplicate" | "delete";
export type ChangeSource = "manual" | "agent_proposal" | "platform";

export async function recordProfileVersion(
  db: Client,
  args: {
    workspaceId: string;
    profileId: string;
    snapshot: Record<string, unknown>;
    assembledPrompt?: string | null;
    changeKind: ChangeKind;
    changeSource?: ChangeSource;
    proposalId?: string | null;
    changedBy?: string | null;
    changeNote?: string | null;
  },
): Promise<number | null> {
  try {
    const { data: last } = await db
      .from("bot_profile_versions")
      .select("version")
      .eq("profile_id", args.profileId)
      .order("version", { ascending: false })
      .limit(1);
    const version = Number(((last ?? [])[0] as { version?: number } | undefined)?.version ?? 0) + 1;
    const { error } = await db.from("bot_profile_versions").insert({
      workspace_id: args.workspaceId,
      profile_id: args.profileId,
      version,
      snapshot: args.snapshot,
      assembled_prompt: args.assembledPrompt ?? null,
      change_kind: args.changeKind,
      change_source: args.changeSource ?? "manual",
      proposal_id: args.proposalId ?? null,
      changed_by: args.changedBy ?? null,
      change_note: args.changeNote ?? null,
    });
    if (error) {
      console.warn(`[bot-profiles] version not recorded: ${error.message}`);
      return null;
    }
    return version;
  } catch (e) {
    console.warn(`[bot-profiles] version not recorded: ${e instanceof Error ? e.message : "unknown"}`);
    return null;
  }
}
