// SMS is metered per segment, the same unit carriers bill on. Every outbound
// send must debit the workspace's SMS credits — otherwise balances, low-balance
// alerts, and the refund path in the pipeline all read against a number that
// never moves.

export function smsSegments(body: string): number {
  const len = body.length;
  if (len <= 160) return 1;
  // Multi-part messages carry a UDH header, shrinking each segment to 153.
  return Math.ceil(len / 153);
}

export async function chargeSmsCredits(args: {
  workspaceId: string;
  body: string;
  reason: string;
}): Promise<void> {
  const { applyCreditDelta } = await import("@/lib/credits.server");
  try {
    await applyCreditDelta(null, {
      workspaceId: args.workspaceId,
      kind: "sms",
      delta: -smsSegments(args.body),
      reason: args.reason,
    });
  } catch (e) {
    // The message is already on the wire; a ledger failure must not crash the
    // run or double-send. Surface it in the logs for reconciliation instead.
    console.error("[sms-charge] failed to debit SMS credits", {
      workspaceId: args.workspaceId,
      reason: args.reason,
      error: (e as Error).message,
    });
  }
}
