import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  User,
  Settings,
  LogOut,
  Users,
  CreditCard,
  Sun,
  Shield,
  ChevronRight,
  ChevronLeft,
  Check,
  Languages,
  Loader2,
  Zap,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/app/theme-toggle";
import { meIsSuperAdmin } from "@/lib/admin.functions";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { useTranslation } from "@/components/translation-provider";
import { LANGUAGES } from "@/config/languages";
import { usePlanContext } from "@/hooks/use-plan-context";
import { planFor } from "@/lib/plans.shared";

// Deterministic accent so each operator gets a recognizable avatar color
// without storing anything extra on the profile.
const AVATAR_TONES = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-slate-500",
  "bg-rose-600",
  "bg-teal-600",
];

function toneFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export function ProfileDropdown({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const avatarUrl = useAvatarUrl();
  const { lang, setLang, translating } = useTranslation();
  const [pane, setPane] = useState<"main" | "language">("main");
  const currentLang = LANGUAGES.find((l) => l.g === lang) ?? LANGUAGES[0];
  const { plan } = usePlanContext();
  const planName = planFor(plan.plan).name;
  const fetchIsAdmin = useServerFn(meIsSuperAdmin);
  const { data: admin } = useQuery({
    queryKey: ["me-is-super-admin"],
    queryFn: () => fetchIsAdmin(),
  });

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "User";
  const userEmail = user?.email || "";
  // First + last name initials (e.g. "Dana O'Neil" → "DO"); falls back to the
  // first two characters when only one word is available.
  const initials = (() => {
    const parts = userName
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/[\s]+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
    }
    return (parts[0] ?? userName).slice(0, 2).toUpperCase();
  })();
  const tone = toneFor(userEmail || userName);

  const go = (path: string) => {
    setOpen(false);
    setPane("main");
    navigate({ to: path });
  };

  const handleSignOut = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPane("main");
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label="Open account menu"
          className={cn(
            "flex items-center justify-center p-0.5 rounded-full border-2 border-primary hover:bg-surface-muted transition-colors",
            className,
          )}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${userName} profile photo`}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white",
                tone,
              )}
            >
              {initials || <User className="h-4 w-4" />}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-80 p-0 rounded-2xl border shadow-2xl bg-background overflow-hidden z-50"
      >
        <div className="px-4 py-4 flex items-center gap-3.5">
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${userName} profile photo`}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center text-sm font-semibold text-white",
                  tone,
                )}
              >
                {initials || <User className="h-5 w-5" />}
              </div>
            )}
            <div className="absolute -right-0.5 -bottom-0.5 h-5 w-5 rounded-full bg-highlight border border-background flex items-center justify-center">
              <User className="h-3 w-3 text-foreground" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
        </div>

        <div className="mx-4 mb-3 space-y-2.5">
          <button
            onClick={() => go("/app/billing")}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Zap className="h-4 w-4" /> Upgrade
          </button>
          <button
            onClick={() => go("/app/team")}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <UserPlus className="h-4 w-4" /> Invite Members
          </button>
        </div>

        <div className="h-px bg-border mx-4" />

        {pane === "language" ? (
          <div className="py-2 px-2" data-no-translate>
            <button
              onClick={() => setPane("main")}
              className="mb-1 flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Language
              {translating && <Loader2 className="ml-auto h-4 w-4 animate-spin opacity-70" />}
            </button>
            <div className="max-h-72 overflow-y-auto">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.g)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="text-sm font-medium">{l.label}</span>
                  {l.g === lang && <Check className="ml-auto h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        ) : (
        <div className="py-2 px-2">
          <MenuItem icon={<Settings className="h-4 w-4" />} label="Account" onClick={() => go("/app/account")} />
          <MenuItem icon={<Users className="h-4 w-4" />} label="Team" onClick={() => go("/app/team")} />
          <MenuItem
            icon={<CreditCard className="h-4 w-4" />}
            label="Subscription"
            onClick={() => go("/app/billing")}
            pill={planName}
          />
          <MenuItem
            icon={<Languages className="h-4 w-4" />}
            label="Language"
            onClick={() => setPane("language")}
            trailing={`${currentLang.flag} ${currentLang.code}`}
          />
          <MenuItem
            icon={<Sun className="h-4 w-4" />}
            label="Theme"
            onClick={toggle}
            trailing={theme === "dark" ? "Dark" : "Light"}
          />
        </div>
        )}

        {pane === "main" && admin?.isSuperAdmin && (
          <>
            <div className="h-px bg-border mx-4" />
            <div className="py-2 px-2">
              <MenuItem
                icon={<Shield className="h-4 w-4" />}
                label="Platform Admin"
                onClick={() => go("/platform")}
              />
            </div>
          </>
        )}

        <div className="px-4 pb-4 pt-2">
          <button
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <LogOut className="h-4 w-4" /> Log Out
          </button>
        </div>

        <div className="border-t border-border px-4 py-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/compliance" onClick={() => setOpen(false)} className="hover:text-foreground">Terms</Link>
          <span aria-hidden>•</span>
          <Link to="/compliance" onClick={() => setOpen(false)} className="hover:text-foreground">Privacy</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  trailing,
  pill,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  trailing?: string;
  pill?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left group hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      {pill ? (
        <span className="ml-auto flex items-center gap-1">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            {pill}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        </span>
      ) : trailing ? (
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {trailing}
          <ChevronRight className="h-4 w-4 opacity-60" />
        </span>
      ) : (
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
      )}
    </button>
  );
}