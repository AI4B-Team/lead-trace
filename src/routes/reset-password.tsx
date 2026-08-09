import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose A New Password — LeadTrace" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Set a new password for your LeadTrace workspace and get straight back to your lead pipeline.",
      },
      { property: "og:title", content: "Choose A New Password — LeadTrace" },
      { property: "og:description", content: "Finish your LeadTrace password reset and sign back in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

/**
 * Landing page for the Supabase recovery email. The recovery link establishes a
 * short-lived session, so the only job here is collecting a new password and
 * calling updateUser. Without a recovery session we say so plainly instead of
 * failing silently on submit.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"checking" | "ready" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let done = false;
    const settle = (hasSession: boolean) => {
      if (done) return;
      done = true;
      setReady(hasSession ? "ready" : "no-session");
    };
    // The recovery token is exchanged asynchronously, so listen as well as read.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle(true);
      else setTimeout(() => settle(false), 1200);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use At Least 8 Characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords Do Not Match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password Updated. You Are Signed In.");
      navigate({ to: "/app/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could Not Update Password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">
          <span className="grid place-items-center h-11 w-11 rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="mt-6 font-display text-4xl font-black text-foreground">Choose A New Password.</h1>

          {ready === "checking" ? (
            <p className="mt-3 text-muted-foreground">Verifying Your Reset Link…</p>
          ) : ready === "no-session" ? (
            <>
              <p className="mt-3 text-muted-foreground">
                This Reset Link Has Expired Or Was Already Used. Request A New One From The Sign-In Page.
              </p>
              <Button asChild className="mt-6 w-full rounded-full h-11">
                <Link to="/auth">Back To Sign In</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 text-muted-foreground">
                Pick Something At Least 8 Characters Long With A Number And A Symbol.
              </p>
              <form onSubmit={submit} className="mt-8 space-y-4">
                <div>
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1"
                  />
                </div>
                <Button type="submit" disabled={busy} className="w-full rounded-full h-11">
                  {busy ? "Updating…" : "Update Password"}
                </Button>
              </form>
              <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Updating Your Password Signs You In On This Device And Leaves Every Other Session Untouched.
              </p>
            </>
          )}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}