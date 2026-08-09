import { useQuery } from "@tanstack/react-query";
import { getTeamContext } from "@/lib/accountability.functions";
import { useWorkspaceId } from "./use-workspace";
import { NO_LIMITS } from "@/lib/accountability.shared";
import type { TeamAction, WorkspaceRole } from "@/lib/team-roles.shared";

/**
 * The signed-in member's role, permissions and spend-vs-cap for the current
 * workspace. Server-resolved: this is for hiding controls the member can't use,
 * never the enforcement point — every write re-checks server-side.
 */
export function useTeamContext() {
  const { workspaceId } = useWorkspaceId();
  const q = useQuery({
    queryKey: ["team-context", workspaceId],
    queryFn: () => getTeamContext({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  const ctx = q.data;
  return {
    workspaceId,
    loading: q.isLoading,
    role: (ctx?.role ?? "member") as WorkspaceRole,
    isAdmin: ctx?.isAdmin ?? false,
    plan: ctx?.plan ?? "starter",
    teamControls: ctx?.teamControls ?? false,
    limits: ctx?.limits ?? NO_LIMITS,
    used: ctx?.used ?? { credits: 0, exportRows: 0 },
    /** Optimistic UI gate. Unknown role defaults to allowed; server decides. */
    can: (action: TeamAction) => ctx?.permissions?.[action] ?? !ctx,
    /**
     * False only for confirmed viewers. Mirrors the server's assertWriter gate
     * so read-only members see disabled controls instead of a failed write.
     */
    canWrite: ctx ? ctx.role !== "viewer" : true,
    refetch: q.refetch,
  };
}
