import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { LANGUAGES } from "@/config/languages";
import { supabase } from "@/integrations/supabase/client";
import { BRAND_NAME } from "@/config/brand";
import { Button } from "@/components/ui/button";
import {
  Radar,
  ShieldCheck,
  Database,
  Send,
  ChevronDown,
  Loader2,
  Menu,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <ComplianceStrip />
      <MarketingFooter />
    </div>
  );
}

const NAV_LINKS = [
  { to: "/leads", label: "Lead Lists" },
  { to: "/surplus-funds", label: "Surplus Funds" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/tools", label: "Free Tools" },
  { to: "/pricing", label: "Pricing" },
] as const;

export { ComplianceStrip, MarketingFooter };

export function MarketingNav({ dark = false }: { dark?: boolean }) {
  const { lang, setLang, translating } = useTranslation();
  const current = LANGUAGES.find((l) => l.g === lang) ?? LANGUAGES[0];
  const { session, loading } = useAuth();
  const signedIn = !!session;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header
      className={
        dark
          ? "border-b border-white/10 bg-ink text-ink-foreground"
          : "border-b border-border bg-background"
      }
    >
      <div className="w-full px-4 sm:px-6 h-16 md:h-20 flex md:grid md:grid-cols-[1fr_auto_1fr] items-center justify-between gap-3">
        <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-2.5 font-display font-bold text-xl sm:text-2xl">
          <span className="grid place-items-center h-9 w-9 shrink-0 sm:h-10 sm:w-10 rounded-xl bg-primary text-primary-foreground">
            <Radar className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <span className="truncate">{BRAND_NAME}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-base font-medium justify-self-center">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={dark ? "text-ink-foreground/90 hover:text-ink-foreground" : "text-foreground hover:text-primary"}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4 md:justify-self-end">
          {!loading && signedIn ? (
            <>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.assign("/");
                }}
                className={`hidden md:inline-flex text-base font-medium px-2 ${dark ? "text-ink-foreground" : "text-foreground"}`}
              >
                Sign Out
              </button>
              <Button asChild className="rounded-full md:h-11 md:px-8 md:text-base">
                <Link to="/app/dashboard">Dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                className={`hidden md:inline-flex text-base font-medium px-2 ${dark ? "text-ink-foreground" : "text-foreground"}`}
              >
                Log In
              </Link>
              <Button asChild className="rounded-full md:h-11 md:px-8 md:text-base">
                <Link to="/auth" search={{ mode: "signup" }}>Start Free</Link>
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Select language"
              data-no-translate
              className={`hidden md:inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base font-medium cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                dark
                  ? "border-white/20 text-ink-foreground hover:bg-white/10"
                  : "border-border text-foreground hover:bg-surface-muted"
              }`}
            >
              <span className="text-lg leading-none">{current.flag}</span>
              <span>{current.code}</span>
              {translating ? (
                <Loader2 className="h-4 w-4 animate-spin opacity-70" />
              ) : (
                <ChevronDown className="h-4 w-4 opacity-70" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-no-translate className="max-h-80 overflow-y-auto w-56">
              {LANGUAGES.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onSelect={() => setLang(l.g)}
                  className="cursor-pointer gap-2"
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="font-medium w-8">{l.code}</span>
                  <span className="text-muted-foreground">{l.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className={`md:hidden grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
                dark ? "border-white/20 text-ink-foreground" : "border-border text-foreground"
              }`}
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto p-6">
              <nav className="mt-6 flex flex-col gap-1 text-lg font-medium">
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-3 text-foreground hover:bg-surface-muted"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 flex flex-col gap-2 border-t border-border pt-6">
                {signedIn ? (
                  <>
                    <Button asChild className="rounded-full" onClick={() => setMenuOpen(false)}>
                      <Link to="/app/dashboard">Dashboard</Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={async () => {
                        await supabase.auth.signOut();
                        window.location.assign("/");
                      }}
                    >
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild className="rounded-full" onClick={() => setMenuOpen(false)}>
                      <Link to="/auth" search={{ mode: "signup" }}>Start Free</Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-full" onClick={() => setMenuOpen(false)}>
                      <Link to="/auth">Log In</Link>
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-6 border-t border-border pt-6" data-no-translate>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">Language</p>
                <div className="grid grid-cols-3 gap-2">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setLang(l.g)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-medium ${
                        l.g === current.g ? "border-primary text-primary" : "border-border text-foreground"
                      }`}
                    >
                      <span className="text-base leading-none">{l.flag}</span>
                      {l.code}
                    </button>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function ComplianceStrip() {
  return (
    <section className="bg-ink text-ink-foreground py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-6 flex flex-col items-start gap-4 text-sm sm:flex-row sm:items-center sm:justify-around">
        <Item icon={<Database className="h-6 w-6 shrink-0" />} label="Multi-Source Data" />
        <Item icon={<ShieldCheck className="h-6 w-6 shrink-0" />} label="Clean & Verified" />
        <Item icon={<Send className="h-6 w-6 shrink-0" />} label="Launch Outreach" />
      </div>
    </section>
  );
}

function Item({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <span className="text-ink-foreground/90">{label}</span>
    </div>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="w-full px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-2 items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-display font-bold text-base text-foreground">
          <span className="grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground">
            <Radar className="h-4 w-4" />
          </span>
          {BRAND_NAME}
        </div>
        <div className="md:text-right">© {new Date().getFullYear()} {BRAND_NAME}. All Rights Reserved.</div>
      </div>
    </footer>
  );
}