import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { getLandingTarget } from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Opening Your Workspace — LeadTrace" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Landing,
});

/**
 * Post-login landing routes by account state, not a fixed page: a truly new
 * account goes to Build (first value), everyone else to the Dashboard.
 */
function Landing() {
  const navigate = useNavigate();
  const { workspaceId, loading } = useWorkspaceId();
  const resolve = useServerFn(getLandingTarget);

  const { data } = useQuery({
    queryKey: ["landing-target", workspaceId],
    queryFn: () => resolve({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!loading && !workspaceId) {
      navigate({ to: "/app/dashboard", replace: true });
      return;
    }
    if (!data) return;
    navigate({
      to: data.target === "assistant" ? "/app/assistant" : "/app/dashboard",
      replace: true,
    });
  }, [data, loading, workspaceId, navigate]);

  return (
    <div className="flex items-center gap-2 p-6 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading Your Workspace…
    </div>
  );
}