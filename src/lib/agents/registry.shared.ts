/**
 * The background agent registry. Plain-language descriptions live here because
 * an operator must be able to tell what an agent does without documentation.
 *
 * Every agent ships in flag-only mode. Nothing here is ever defaulted to
 * 'active' on an existing workspace — an operator opts in, per agent.
 */

export type AgentKey =
  | "conversation_labeler"
  | "lead_scout"
  | "hot_lead_scorer"
  | "booking_auditor"
  | "coach"
  | "wisdom_miner";

export type AgentMode = "flag_only" | "active" | "off";

export type AgentDefinition = {
  key: AgentKey;
  name: string;
  /** One plain sentence. Shown verbatim on the agent card. */
  description: string;
  cadence: string;
  intervalMinutes: number;
  /** Agents that may never be switched to 'active'. */
  proposalsOnly?: boolean;
  /** Implemented and wired into the runner. */
  implemented: boolean;
};

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    key: "conversation_labeler",
    name: "Conversation Labeler",
    description: "Reads finished conversations and records what actually happened in each one.",
    cadence: "Every Hour",
    intervalMinutes: 60,
    implemented: true,
  },
  {
    key: "lead_scout",
    name: "Lead Scout",
    description:
      "Reads your whole book of leads, not just the recent end of it, and nominates the ones genuinely worth a touch today.",
    cadence: "Every 3 Hours",
    intervalMinutes: 180,
    implemented: true,
  },
  {
    key: "hot_lead_scorer",
    name: "Hot-Lead Scorer",
    description:
      "Ranks leads against what your own workspace has actually converted, and refits its weighting once a week.",
    cadence: "Retrains Weekly",
    intervalMinutes: 10080,
    implemented: false,
  },
  {
    key: "booking_auditor",
    name: "Booking Auditor",
    description:
      "Re-reads new bookings against what the lead actually asked for and flags the ones that drifted.",
    cadence: "Every 15 Minutes",
    intervalMinutes: 15,
    implemented: false,
  },
  {
    key: "coach",
    name: "Coach",
    description:
      "Reviews your bot's own transcripts the way a manager reviews call recordings, and drafts specific copy edits for you to approve.",
    cadence: "Weekly",
    intervalMinutes: 10080,
    proposalsOnly: true,
    implemented: false,
  },
  {
    key: "wisdom_miner",
    name: "Wisdom Miner",
    description:
      "Watches the moments a person took a conversation over and captures what they said instead of the bot's line.",
    cadence: "Every 45 Minutes",
    intervalMinutes: 45,
    proposalsOnly: true,
    implemented: false,
  },
];

export function agentDefinition(key: string): AgentDefinition | undefined {
  return AGENT_DEFINITIONS.find((a) => a.key === key);
}

export const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  off: "Off",
  flag_only: "Flag Only",
  active: "Active",
};

/** Rationale worth showing verbatim, per spec. */
export const AGENT_GOVERNANCE_NOTE =
  "An AI that edits its own instructions unsupervised is a thing you cannot audit after the fact. Every change an agent wants to make arrives here as a proposal a person approves.";