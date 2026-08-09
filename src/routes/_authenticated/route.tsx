import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppRouteErrorState, RouteNotFoundState } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Use getSession() rather than getUser() for the client-side gate: it reads
    // from localStorage and doesn't hit the network, so transient fetch
    // failures / token refresh hiccups don't bounce the user to /auth.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthenticatedShell,
  // Scope failures to the app shell so a single screen's error doesn't fall
  // through to the marketing-styled root boundary.
  errorComponent: AppRouteErrorState,
  notFoundComponent: () => (
    <RouteNotFoundState
      title="Screen Not Found"
      message="That page doesn't exist in your workspace. Use the sidebar to get back on track."
    />
  ),
});

function AuthenticatedShell() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .limit(1);
      if (!memberships || memberships.length === 0) {
        navigate({ to: "/onboarding" });
        return;
      }
      setChecked(true);
    })();
  }, [navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Loading Your Workspace…</div>
      </div>
    );
  }
  return <Outlet />;
}