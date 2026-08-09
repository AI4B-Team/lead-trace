import { z } from "zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Home, Sun, Wrench, Briefcase, MoreHorizontal } from "lucide-react";
import { safeRedirect } from "@/lib/prompt-handoff";
import { createWorkspace } from "@/lib/workspace-create.functions";

const INDUSTRIES = [
  { key: "insurance",     label: "Insurance",         icon: Shield },
  { key: "real_estate",   label: "Real Estate",       icon: Home },
  { key: "solar",         label: "Solar & Roofing",   icon: Sun },
  { key: "home_services", label: "Home Services",     icon: Wrench },
  { key: "agency",        label: "Agencies",          icon: Briefcase },
  { key: "other",         label: "Other",             icon: MoreHorizontal },
] as const;

export const Route = createFileRoute("/onboarding")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Set Up Your Workspace — LeadTrace" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Name your workspace and pick your industry to unlock preset templates and starter credits." },
      { property: "og:title", content: "Set Up Your LeadTrace Workspace" },
      { property: "og:description", content: "Pick your industry to get preset templates and starter credits." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const target = safeRedirect(search.redirect);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<string>("insurance");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .limit(1);
      if (memberships && memberships.length > 0) {
        if (target) window.location.replace(target);
        else navigate({ to: "/app/dashboard" });
        return;
      }
      const email = userRes.user.email ?? "";
      const handle = email.split("@")[0];
      const displayHandle = handle ? handle.charAt(0).toUpperCase() + handle.slice(1).toLowerCase() : "";
      setName(displayHandle ? `${displayHandle}'s Workspace` : "My Workspace");
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not Signed In");

      await createWorkspace({
        data: { name: name.trim() || "My Workspace", industry, starterCredits: true },
      });

      toast.success("Workspace Ready.");
      if (target) window.location.replace(target);
      else navigate({ to: "/app/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-14">
          <h1 className="font-display text-4xl font-black text-foreground">Set Up Your Workspace.</h1>
          <p className="text-muted-foreground mt-2">
            Pick Your Industry To Unlock Preset Templates And Starter Credits.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-6">
            <div>
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label>What Do You Do?</Label>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                {INDUSTRIES.map(({ key, label, icon: Icon }) => {
                  const active = industry === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIndustry(key)}
                      className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      <span
                        className={`grid place-items-center h-9 w-9 rounded-lg ${
                          active ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-semibold text-foreground">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
              You'll Start With <span className="font-semibold text-foreground">1,000 Lead Credits</span>,{" "}
              <span className="font-semibold text-foreground">500 Skip Trace</span>, And{" "}
              <span className="font-semibold text-foreground">250 SMS</span> Trial Credits.
            </div>
            <Button type="submit" disabled={busy} className="w-full rounded-full">
              {busy ? "Setting Up…" : "Create Workspace"}
            </Button>
          </form>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}