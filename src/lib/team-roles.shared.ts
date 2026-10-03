// ---------------------------------------------------------------------------
// Workspace roles and the actions they gate.
//
// Kept deliberately small: three real roles, one permission table. Anything
// that spends credits or moves data out of the workspace is listed here, so
// there is exactly one place to answer "is this person allowed to do that?".
// ---------------------------------------------------------------------------

export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_BLURB: Record<WorkspaceRole, string> = {
  owner: "Full Control — Billing, Members, Suppression, Everything.",
  admin: "Full Control Except Ownership Transfer.",
  member: "Builds And Works Lists, Sends Campaigns, Exports Within Caps.",
  viewer: "Read-Only — Cannot Spend Credits Or Export Data.",
};

/** Every gated action in the app. */
export type TeamAction =
  | "build_list"
  | "export_list"
  | "launch_campaign"
  | "purchase_credits"
  | "delete_data"
  | "edit_suppression"
  | "manage_members"
  | "manage_limits"
  | "decide_approvals"
  | "view_member_costs";

const ADMIN_ONLY: TeamAction[] = [
  "purchase_credits",
  "delete_data",
  "edit_suppression",
  "manage_members",
  "manage_limits",
  "decide_approvals",
  "view_member_costs",
];

const MEMBER_PLUS: TeamAction[] = ["build_list", "export_list", "launch_campaign"];

export function roleOf(role: string | null | undefined): WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(role ?? "")
    ? (role as WorkspaceRole)
    : "member";
}

export function isAdminRole(role: string | null | undefined): boolean {
  const r = roleOf(role);
  return r === "owner" || r === "admin";
}

/** Single source of truth for "may this role do this?". */
export function can(role: string | null | undefined, action: TeamAction): boolean {
  const r = roleOf(role);
  if (r === "viewer") return false; // read-only: never spends, never exports
  if (isAdminRole(r)) return true;
  return MEMBER_PLUS.includes(action) && !ADMIN_ONLY.includes(action);
}

export function denialMessage(role: string | null | undefined, action: TeamAction): string {
  const r = roleOf(role);
  const what: Record<TeamAction, string> = {
    build_list: "Build Lists",
    export_list: "Export Data",
    launch_campaign: "Launch Campaigns",
    purchase_credits: "Purchase Credits",
    delete_data: "Delete Data",
    edit_suppression: "Edit Suppression",
    manage_members: "Manage Members",
    manage_limits: "Set Member Limits",
    decide_approvals: "Approve Requests",
    view_member_costs: "View Member Costs",
  };
  return r === "viewer"
    ? `Viewers Cannot ${what[action]}. Ask An Admin For Member Access.`
    : `Only Admins Can ${what[action]}.`;
}

// --- Role ceiling ----------------------------------------------------------
// Nobody can grant a role above their own. Owner may grant anything; admin may
// grant admin/member/viewer (never owner); member/viewer may grant nothing.
const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function assignableRoles(actorRole: string | null | undefined): WorkspaceRole[] {
  if (!actorRole || !isAdminRole(actorRole)) return [];
  const rank = ROLE_RANK[roleOf(actorRole)];
  return WORKSPACE_ROLES.filter((r) => ROLE_RANK[r] <= rank);
}

export function assertCanAssignRole(
  actorRole: string | null | undefined,
  targetRole: string,
): void {
  if (!actorRole || !isAdminRole(actorRole)) {
    throw new Error("Only workspace owners and admins can assign roles.");
  }
  if (!(assignableRoles(actorRole) as string[]).includes(targetRole)) {
    throw new Error(
      `A workspace ${actorRole} cannot assign the ${targetRole} role — you can't grant a role above your own.`,
    );
  }
}

// --- Plan gating -----------------------------------------------------------
// Roles and the attributed log are foundational and ship to everyone. Caps,
// approval workflows and anomaly alerts are a team capability.
const TEAM_PLANS = new Set(["team", "business", "scale", "agency", "enterprise"]);

export function hasTeamControls(billingPlan: string | null | undefined): boolean {
  return TEAM_PLANS.has((billingPlan ?? "").toLowerCase());
}

export const TEAM_CONTROLS_UPSELL =
  "Per-Member Caps, Approval Thresholds And Anomaly Alerts Are Included On Team Plans.";
