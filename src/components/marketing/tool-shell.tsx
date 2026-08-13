import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function ToolShell<T>({
  eyebrow,
  title,
  blurb,
  action,
  render,
  notes,
  related,
  initialPhone = "",
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  action: (phone: string) => Promise<T>;
  render: (result: T) => ReactNode;
  notes: string[];
  related: { to: string; label: string }[];
  initialPhone?: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<T | null>(null);

  const run = async () => {
    if (!phone.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await action(phone.trim()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">{eyebrow}</div>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl font-black text-foreground leading-tight">
          {title}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">{blurb}</p>

        <Card className="mt-8">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void run();
                }}
                placeholder="(813) 555-0142"
                inputMode="tel"
              />
              <Button className="rounded-full" onClick={run} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check Number"}
              </Button>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              One Number At A Time. Bulk Checks Run Inside The Pipeline —{" "}
              <Link to="/auth" search={{ mode: "signup" }} className="text-primary font-medium">
                Start Free
              </Link>{" "}
              To Scrub Whole Lists.
            </div>
            {result !== null && <div className="mt-6">{render(result)}</div>}
          </CardContent>
        </Card>

        <div className="mt-10 rounded-2xl border border-border bg-surface-muted p-6">
          <div className="flex items-center gap-2 font-display font-bold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" /> Honest Notes
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          {related.map((r) => (
            <a
              key={r.to}
              href={r.to}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-primary"
            >
              {r.label}
            </a>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-ink text-ink-foreground p-8">
          <div className="font-display font-black whitespace-nowrap text-[clamp(0.85rem,2.4vw,1.5rem)]">Type A Niche And A County. Get A Clean List In Minutes.</div>
          <Button asChild className="mt-5 rounded-full">
            <Link to="/auth" search={{ mode: "signup" }}>
              Start Free <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
