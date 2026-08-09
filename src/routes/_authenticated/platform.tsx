import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Database,
  Building2,
  Layers,
  LayoutDashboard,
  Radar,
  Repeat,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminGate, useSuperAdminGate } from "@/components/app/admin-shared";
import { BRAND_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";
import { AppRouteErrorState, RouteNotFoundState } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/platform")({
  component: PlatformLayout,
  errorComponent: AppRouteErrorState,
  notFoundComponent: () => (
    <RouteNotFoundState
      title="Console Screen Not Found"
      message="That admin page doesn't exist. Use the console navigation to get back on track."
    />
  ),
});

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/platform", label: "Overview", icon: LayoutDashboard },
  { to: "/platform/workspaces", label: "Workspaces", icon: Building2 },
  { to: "/platform/sources", label: "Source Requests", icon: Layers },
  { to: "/platform/sequences", label: "Sequences", icon: Repeat },
  { to: "/platform/records", label: "Public Records", icon: Database },
  { to: "/platform/access", label: "Admin Access", icon: ShieldCheck },
];

/**
 * Platform Admin is a separate application shell: no workspace switcher, no
 * Build List, no customer-facing chrome. Nothing here belongs to a workspace.
 */
function PlatformLayout() {
  const gate = useSuperAdminGate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-surface-muted">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <Radar className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-sm font-bold">{BRAND_NAME}</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Platform
            </div>
          </div>
        </div>
        <nav aria-label="Platform" className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active =
              item.to === "/platform" ? pathname === "/platform" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="w-full justify-start rounded-xl text-xs"
          >
            <Link to="/app/dashboard">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back To My Workspace
            </Link>
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto lg:hidden">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="hidden font-display text-sm font-semibold lg:block">Platform Admin</div>
          <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full text-xs">
            <Link to="/app/dashboard">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> My Workspace
            </Link>
          </Button>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="app-density p-4 sm:p-6 md:p-8">
            <AdminGate gate={gate}>
              <Outlet />
            </AdminGate>
          </div>
        </main>
      </div>
    </div>
  );
}
