import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { ProfileDropdown } from "@/components/app/profile-dropdown";
import { NotificationBell } from "@/components/app/notification-bell";
import { ActivityPanel } from "@/components/app/activity-panel";
import { HelpMenu } from "@/components/app/help-menu";
import { ProductTour, useProductTour } from "@/components/app/product-tour";
import { CreditMenu } from "@/components/app/credit-menu";
import { SeatGuard } from "@/components/app/seat-guard";
import { InboxNavButton } from "@/components/app/needs-reply";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <AppLayoutInner />
    </SidebarProvider>
  );
}

function AppLayoutInner() {
  const tour = useProductTour();
  const navigate = useNavigate();
  const { setOpen, isMobile } = useSidebar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isInbox = pathname === "/app/inbox";
  const isListsOrLeads = pathname === "/app/lists" || pathname === "/app/leads";

  // On the Conversations page every pixel counts for the three-panel layout,
  // so we collapse the sidebar automatically when the user lands there.
  // Same for Lists and Leads, which are high-density table views.
  useEffect(() => {
    if (!isMobile && (isInbox || isListsOrLeads)) setOpen(false);
  }, [isInbox, isListsOrLeads, isMobile, setOpen]);

  return (
    <div className="min-h-screen flex w-full bg-surface-muted">
      <SeatGuard />
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="md:hidden h-9 w-9 shrink-0" />
            <div className="hidden md:block"><WorkspaceSwitcher /></div>
          </div>
          <TooltipProvider delayDuration={150}>
            <div className="flex shrink-0 items-center gap-1">
              {/* Credits + Build List sit together: having credits nudges using them. */}
              <div className="flex items-center gap-2 sm:mr-2">
                <div className="hidden sm:block"><CreditMenu /></div>
                <Button
                  size="sm"
                  className="rounded-full px-3"
                  onClick={() => navigate({ to: "/app/assistant" })}
                >
                  <Plus className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Build List</span>
                  <span className="sr-only sm:hidden">Build List</span>
                </Button>
              </div>
              <InboxNavButton />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex"><ActivityPanel /></span>
                </TooltipTrigger>
                <TooltipContent>Activity</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hidden sm:inline-flex"><NotificationBell /></span>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hidden sm:inline-flex"><HelpMenu onStartTour={tour.start} /></span>
                </TooltipTrigger>
                <TooltipContent>Help</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex sm:ml-1.5"><ProfileDropdown /></span>
                </TooltipTrigger>
                <TooltipContent>Account</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="app-density p-4 sm:p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
      <ProductTour open={tour.open} onClose={tour.close} />
    </div>
  );
}
