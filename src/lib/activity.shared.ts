// Operational activity feed — orientation, not evidence.
//
// The rule of thumb: "would I hand this to a lawyer?" If yes, it belongs in the
// compliance record (suppression list, blocked-send log, opt-out timeline on
// /app/compliance) which is immutable and exportable. If it is only "what
// happened lately", it belongs here. The feed may LINK to compliance, but it is
// never the system of record for it.

export const ACTIVITY_TYPES = [
  "list_built",
  "run_completed",
  "campaign_created",
  "campaign_launched",
  "campaign_paused",
  "credits_purchased",
  "credits_low",
  "number_added",
  "number_cooled",
  "brand_status",
  "cadence_set",
  "adapter_requested",
  "compliance_digest",
  // A person's decision on something a background agent proposed.
  "agent_decision",
  // Internal accountability (who spent, who exported, who changed access).
  // Distinct from the compliance record, which stays a single-purpose legal log.
  "list_exported",
  "member_invited",
  "member_removed",
  "member_role_changed",
  "member_limits_set",
] as const;


export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ActivityEvent = {
  id: string;
  type: string;
  summary: string;
  detail: string | null;
  ref_id: string | null;
  ref_type: string | null;
  created_at: string;
};

/** Filter groups shown as chips in the slide-out. */
export const ACTIVITY_GROUPS: Array<{ key: string; label: string; types: ActivityType[] }> = [
  { key: "all", label: "All", types: [...ACTIVITY_TYPES] },
  { key: "lists", label: "Lists", types: ["list_built", "run_completed", "cadence_set", "adapter_requested"] },
  { key: "campaigns", label: "Campaigns", types: ["campaign_created", "campaign_launched", "campaign_paused"] },
  { key: "credits", label: "Credits", types: ["credits_purchased", "credits_low"] },
  { key: "numbers", label: "Numbers", types: ["number_added", "number_cooled", "brand_status"] },
  { key: "compliance", label: "Compliance", types: ["compliance_digest"] },
  { key: "agents", label: "Agents", types: ["agent_decision"] },
  {
    key: "team",
    label: "Team",
    types: ["list_exported", "member_invited", "member_removed", "member_role_changed", "member_limits_set"],
  },
];

export const ACTIVITY_ICON: Record<string, string> = {
  list_built: "list",
  run_completed: "repeat",
  campaign_created: "megaphone",
  campaign_launched: "rocket",
  campaign_paused: "pause",
  credits_purchased: "wallet",
  credits_low: "zap",
  number_added: "phone",
  number_cooled: "thermometer",
  brand_status: "badge",
  cadence_set: "clock",
  adapter_requested: "sparkles",
  compliance_digest: "shield",
  agent_decision: "bot",
  list_exported: "download",
  member_invited: "user-plus",
  member_removed: "user-minus",
  member_role_changed: "shield-check",
  member_limits_set: "gauge",
};

/** Where a row navigates when clicked. Returns null when there's no detail view. */
export function activityLink(
  ev: Pick<ActivityEvent, "ref_id" | "ref_type" | "type">,
): string | null {
  switch (ev.ref_type) {
    case "list":
      return ev.ref_id ? `/app/lists/${ev.ref_id}` : "/app/lists";
    case "campaign":
      return ev.ref_id ? `/app/campaigns/${ev.ref_id}` : "/app/campaigns";
    case "credits":
      return "/app/billing";
    case "number":
      return "/app/numbers";
    case "registration":
      return "/app/registration";
    case "compliance":
      return "/app/compliance";
    case "template":
      return "/app/assistant";
    case "member":
    case "export":
      return "/app/team";
    default:
      return null;
  }
}