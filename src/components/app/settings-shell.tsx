import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  User,
  Lock,
  KeyRound,
  Bell,
  CreditCard,
  Users,
  Building2,
  Smartphone,
  BadgeCheck,
  ShieldCheck,
  Plug,
  Code2,
  LayoutDashboard,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AccountTabKey =
  | "profile"
  | "security"
  | "notifications"
  | "billing"
  | "api"
  | "workspace"
  | "team"
  | "numbers"
  | "registration"
  | "integrations"
  | "developer"
  | "agents"
  | "compliance"
  | "workspace-admin";

type NavDef = {
  key: AccountTabKey;
  label: string;
  icon: LucideIcon;
  to:
    | "/app/account"
    | "/app/billing"
    | "/app/team"
    | "/app/settings"
    | "/app/registration"
    | "/app/compliance"
    | "/app/numbers"
    | "/app/integrations"
    | "/app/api"
    | "/app/background-agents"
    | "/app/workspace";
  search?: { tab: "profile" | "security" | "notifications" | "api" };
};

const GROUPS: { label: string; items: NavDef[] }[] = [
  {
    label: "Account",
    items: [
      { key: "profile", label: "Profile", icon: User, to: "/app/account", search: { tab: "profile" } },
      { key: "security", label: "Security", icon: Lock, to: "/app/account", search: { tab: "security" } },
      { key: "notifications", label: "Notifications", icon: Bell, to: "/app/account", search: { tab: "notifications" } },
      { key: "billing", label: "Subscription", icon: CreditCard, to: "/app/billing" },
      { key: "api", label: "API Keys", icon: KeyRound, to: "/app/account", search: { tab: "api" } },
    ],
  },
  {
    label: "Workspace",
    items: [
      { key: "workspace-admin", label: "Overview", icon: LayoutDashboard, to: "/app/workspace" },
      { key: "workspace", label: "General", icon: Building2, to: "/app/settings" },
      { key: "team", label: "Team", icon: Users, to: "/app/team" },
      { key: "numbers", label: "Numbers", icon: Smartphone, to: "/app/numbers" },
    ],
  },
  {
    label: "Automation",
    items: [
      { key: "integrations", label: "Integrations", icon: Plug, to: "/app/integrations" },
      { key: "agents", label: "Agents", icon: Bot, to: "/app/background-agents" },
      { key: "developer", label: "Webhooks & API", icon: Code2, to: "/app/api" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { key: "registration", label: "10DLC", icon: BadgeCheck, to: "/app/registration" },
      { key: "compliance", label: "Compliance", icon: ShieldCheck, to: "/app/compliance" },
    ],
  },
];

export function SettingsShell({
  current,
  children,
}: {
  current: AccountTabKey;
  children: ReactNode;
}) {
  // Settings is customer-scoped only. Platform tooling lives in its own app at /platform.
  const groups = GROUPS;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Settings" className="lg:sticky lg:top-6">
        <div className="mb-4 hidden text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:block">
          Workspace Admin
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {groups.map((g) => (
            <div key={g.label} className="min-w-0">
              <div className="mb-1.5 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 lg:block">
                {g.label}
              </div>
              <div className="flex gap-1.5 lg:flex-col">
                {g.items.map((item) => {
                  const active = item.key === current;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.key}
                      to={item.to}
                      {...(item.search ? { search: item.search } : {})}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
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
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
