import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-workspace";
import {
  LayoutDashboard,
  Plus,
  ListChecks,
  MessageSquare,
  Radar,
  BarChart3,
  Bot,
  Sparkles,
  Users,
  Home,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BRAND_NAME } from "@/config/brand";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";

const ITEMS = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/assistant", label: "Build", icon: Plus },
  { to: "/app/lists", label: "Lists", icon: ListChecks },
  { to: "/app/leads", label: "Leads", icon: Users },
  { to: "/app/property-search", label: "Property Search", icon: Home },
  { to: "/app/agent", label: "AI Agent", icon: Bot },
  { to: "/app/background-agents", label: "Background Agents", icon: Sparkles },
  { to: "/app/campaigns", label: "Campaigns", icon: MessageSquare },
  { to: "/app/reports", label: "Performance", icon: BarChart3 },
] as const;

type Counts = { lists: number; leads: number; campaigns: number };

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  const { workspaceId } = useWorkspaceId();
  const [counts, setCounts] = useState<Counts>({ lists: 0, leads: 0, campaigns: 0 });

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      const [lists, leads, campaigns] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
        // Distinct, de-duplicated leads — must match the Leads page header total.
        supabase.from("lead_records").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      ]);
      setCounts({ lists: lists.count ?? 0, leads: leads.count ?? 0, campaigns: campaigns.count ?? 0 });
    })();
  }, [workspaceId]);

  const badgeFor = (to: string) =>
    to === "/app/lists" ? counts.lists
    : to === "/app/leads" ? counts.leads
    : to === "/app/campaigns" ? counts.campaigns
    : 0;

  const collapsed = !isMobile && state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <TooltipProvider delayDuration={0}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className={cn("relative flex items-center px-2 py-2", collapsed ? "justify-center" : "justify-between gap-1")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/app/dashboard"
                  className={cn(
                    "flex items-center gap-2 font-display font-bold text-base text-sidebar-foreground",
                    collapsed && "justify-center"
                  )}
                >
                  <span className="grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground shrink-0">
                    <Radar className="h-4 w-4" />
                  </span>
                  {!collapsed && BRAND_NAME}
                </Link>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right" className="bg-popover text-popover-foreground border-border shadow-md">
                  {BRAND_NAME}
                </TooltipContent>
              )}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className={cn("h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", collapsed && "absolute right-1")} />
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right" className="bg-popover text-popover-foreground border-border shadow-md">
                  Expand Menu
                </TooltipContent>
              )}
            </Tooltip>
          </div>
          {isMobile && (
            <div className="px-2 pb-1">
              <WorkspaceSwitcher />
            </div>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Navigate</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {ITEMS.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  const badge = badgeFor(item.to);
                  const label = item.label;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton asChild isActive={active} data-tour={`nav-${item.to.replace("/app/", "")}`}>
                            <Link to={item.to} className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              {!collapsed && <span className="flex-1">{label}</span>}
                              {!collapsed && badge > 0 && (
                                <span className="shrink-0 rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-sidebar-accent-foreground">
                                  {badge > 999 ? "999+" : badge}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        {collapsed && (
                          <TooltipContent side="right" className="bg-popover text-popover-foreground border-border shadow-md">
                            {label}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
