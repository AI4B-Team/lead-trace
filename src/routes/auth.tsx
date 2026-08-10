import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Radar, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { safeRedirect } from "@/lib/prompt-handoff";
import { mfaStepUpRequired } from "@/lib/mfa";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    mode: z.enum(["signin", "signup"]).optional(),
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign In or Start Free — LeadTrace" },
      { name: "description", content: "Sign in to your LeadTrace workspace or start free in seconds." },
      { property: "og:title", content: "Sign In To LeadTrace" },
      { property: "og:description", content: "Sign in or start free with email and password, or a magic link." },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/auth") }],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

/** Rebuilds /start's own search params from a post-auth destination URL. */
function promptSearchFrom(target: string) {
  const query = target.includes("?") ? new URLSearchParams(target.split("?")[1]) : new URLSearchParams();
  const out = new URLSearchParams();
  if (query.get("reattach")) out.set("upload", "true");
  const prompt = query.get("prompt");
  if (prompt) out.set("prompt", prompt);
  const s = out.toString();
  return s ? `?${s}` : "";
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    const hubError = new URLSearchParams(window.location.search).get("hub_error");
    if (hubError) toast.error(`Real Elite sign-in failed: ${hubError}`);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        // A verified authenticator means the session isn't trusted until the
        // code is entered, so stay here and challenge instead of forwarding.
        void mfaStepUpRequired().then((required) => {
          if (required) {
            setNeedsMfa(true);
            return;
          }
        const target = safeRedirect(search.redirect);
        if (target) window.location.href = target;
        else navigate({ to: "/app/dashboard" });
        });
      }
    });
  }, [navigate, search.redirect]);

  // Onboarding forwards the destination on, so new signups also land on it.
  const target = safeRedirect(search.redirect);
  const onboardingUrl = `/onboarding${target ? `?redirect=${encodeURIComponent(target)}` : ""}`;

  const goAfterAuth = () => {
    if (target) window.location.href = target;
    else navigate({ to: "/onboarding" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + onboardingUrl },
        });
        if (error) throw error;
        toast.success("Check Your Email To Confirm Your Account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        try { localStorage.setItem("leadtrace_returning", "1"); } catch { /* ignore */ }
        if (await mfaStepUpRequired()) {
          setNeedsMfa(true);
          return;
        }
        goAfterAuth();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something Went Wrong");
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    try {
      // /start re-checks the session and forwards to the saved destination,
      // so the prompt survives the OAuth round trip.
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + (target ? `/start${promptSearchFrom(target)}` : ""),
      });
      if (result.error) throw result.error;
      if (!result.redirected) window.location.href = target ?? onboardingUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google Sign-In Failed");
    } finally {
      setGoogleBusy(false);
    }
  };

  const sendMagicLink = async () => {
    if (!email) {
      toast.error("Enter Your Email First.");
      return;
    }
    setMagicBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + onboardingUrl },
      });
      if (error) throw error;
      toast.success("Magic Link Sent. Check Your Email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something Went Wrong");
    } finally {
      setMagicBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!email) {
      toast.error("Enter Your Email First.");
      return;
    }
    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Reset Link Sent. Check Your Email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something Went Wrong");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-4rem)]">
          {/* Left panel — brand / value */}
          <aside className="relative hidden lg:flex flex-col justify-between bg-foreground text-background p-12 xl:p-16 overflow-hidden">
            <div className="relative">
              <div className="inline-flex items-center gap-2">
                <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground">
                  <Radar className="h-5 w-5" />
                </span>
                <span className="font-display text-xl font-black tracking-tight">LeadTrace</span>
              </div>
              <h2 className="mt-10 font-display text-4xl xl:text-5xl font-black leading-[1.02] tracking-tight">
                Find Them.<br />Reach Them.<br />Close Them.
              </h2>
              <p className="mt-4 max-w-sm text-background/70">
                One Pipeline For Scraping, Skip Tracing, Scrubbing, And SMS — Compliance Baked In.
              </p>
            </div>
            <ul className="relative mt-10 space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>Business Scrapes + Public Records In One Place.</span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>DNC + Litigator Scrubbing On Every List.</span>
              </li>
              <li className="flex items-start gap-3">
                <Zap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>Local Phone Numbers & Rotation.</span>
              </li>
            </ul>
          </aside>

          {/* Right panel — auth form */}
          <div className="flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-md">
          <h1 className="font-display text-4xl font-black text-foreground">
            {needsMfa ? "One More Step." : mode === "signup" ? "Start Free." : "Welcome Back."}
          </h1>
          <p className="text-muted-foreground mt-2">
            {needsMfa
              ? "Your Account Has Two-Factor Authentication Turned On."
              : mode === "signup"
                ? "Create Your LeadTrace Workspace In Seconds."
                : "Sign In To Run Your Pipeline."}
          </p>

          {needsMfa ? (
            <div className="mt-8">
              <MfaChallenge onVerified={goAfterAuth} />
            </div>
          ) : (
          <>
          <Button
            type="button"
            variant="outline"
            onClick={signInWithGoogle}
            disabled={googleBusy}
            className="mt-8 w-full rounded-full h-11 gap-3 font-medium"
          >
            <GoogleIcon className="h-5 w-5" />
            {googleBusy ? "Redirecting…" : `Continue With Google`}
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span className="uppercase tracking-wider">Or With Email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={sendPasswordReset}
                    disabled={resetBusy}
                    className="text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    {resetBusy ? "Sending…" : "Forgot Password?"}
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full rounded-full h-11">
              {busy ? "Working…" : mode === "signup" ? "Create Workspace" : "Sign In"}
            </Button>
          </form>

          <button
            type="button"
            onClick={sendMagicLink}
            disabled={magicBusy}
            className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground transition"
          >
            {magicBusy ? "Sending…" : "Email Me A Magic Link Instead"}
          </button>

          <p className="text-sm text-muted-foreground mt-6 text-center">
            {mode === "signup" ? "Already Have An Account? " : "New To LeadTrace? "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="text-primary font-medium hover:underline"
            >
              {mode === "signup" ? "Sign In" : "Start Free"}
            </button>
          </p>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            By Continuing You Agree To Our <Link to="/compliance" className="text-primary font-medium">Compliance Terms</Link>.
          </p>
          </>
          )}
          </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/>
    </svg>
  );
}