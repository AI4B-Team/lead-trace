import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneCall, ShieldCheck, ArrowRight, Check, Clock } from "lucide-react";

export const Route = createFileRoute("/tools/")({
  head: () => ({
    meta: [
      { title: "Free Lead & Compliance Tools — DNC And Line Type | LeadTrace" },
      { name: "description", content: "The same verification tools built into every LeadTrace list, free and one lookup at a time: National DNC Registry check and mobile/landline/VoIP line type lookup." },
      { property: "og:title", content: "Free Lead & Compliance Tools" },
      { property: "og:description", content: "The same verification tools built into every LeadTrace list — free, one lookup at a time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/tools" }],
  }),
  component: ToolsHub,
});

const TOOLS = [
  {
    to: "/tools/dnc-checker",
    icon: ShieldCheck,
    title: "DNC Number Checker",
    body: "Check any U.S. phone number against the National Do Not Call Registry before launching outreach.",
    sample: [
      { label: "Status", value: "DNC Clear" },
      { label: "Litigator List", value: "No Match" },
      { label: "Last Checked", value: "Today" },
    ],
  },
  {
    to: "/tools/line-type-checker",
    icon: PhoneCall,
    title: "Line Type Checker",
    body: "Instantly identify whether a number is mobile, landline, or VoIP before you spend a credit.",
    sample: [
      { label: "Line Type", value: "Mobile" },
      { label: "Carrier", value: "Verizon" },
      { label: "Textable", value: "Yes" },
    ],
  },
] as const;

const UPCOMING = [
  "Carrier Lookup",
  "Email Domain Checker",
  "Phone Number Formatter",
  "SMS Segment Calculator",
  "CSV Cleaner",
  "Duplicate Checker",
] as const;

function ToolCard({ tool }: { tool: (typeof TOOLS)[number] }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const open = () =>
    navigate({ to: tool.to, search: { phone: phone.trim() || undefined } });

  return (
    <Card className="h-full transition-colors hover:border-primary">
      <CardContent className="flex h-full flex-col pt-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <tool.icon className="h-6 w-6" />
        </span>
        <div className="mt-4 font-display text-xl font-bold text-foreground">{tool.title}</div>
        <p className="mt-2 text-sm text-muted-foreground">{tool.body}</p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") open();
            }}
            placeholder="Enter Phone Number"
            inputMode="tel"
            aria-label={`Phone number for ${tool.title}`}
          />
          <Button className="rounded-full shrink-0" onClick={open}>
            Check Number
          </Button>
        </div>

        <div className="mt-5 rounded-xl border border-border bg-surface-muted p-4">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Sample Result
          </div>
          <div className="mt-2 font-display text-base font-bold text-foreground">(813) 555-0142</div>
          <dl className="mt-2 space-y-1 text-sm">
            {tool.sample.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Check className="h-3.5 w-3.5 text-primary" /> {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-auto pt-5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Used To Verify Every LeadTrace List
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolsHub() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-primary text-xs font-semibold uppercase tracking-[0.18em]">Free Tools</div>
        <h1 className="mt-3 font-display text-5xl font-black text-foreground leading-tight">
          Free Lead &amp; Compliance Tools
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl lg:whitespace-nowrap">
          The same verification tools built into every LeadTrace list — available free, one lookup at a time.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <ToolCard key={t.to} tool={t} />
          ))}
        </div>

        <div className="mt-16 rounded-2xl bg-ink text-ink-foreground p-8 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <h2 className="font-display text-2xl font-black">Checking One Number?</h2>
            <p className="mt-2 text-sm opacity-80 max-w-xl">
              LeadTrace verifies thousands automatically while building your list — line type, DNC, litigator
              lists, and duplicates, all before you send a single message.
            </p>
          </div>
          <Button asChild className="mt-5 rounded-full shrink-0 sm:mt-0">
            <Link to="/auth" search={{ mode: "signup" }}>
              Build My List <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-surface-muted p-6">
          <div className="flex items-center gap-2 font-display font-bold text-foreground">
            <Clock className="h-5 w-5 text-primary" /> More Free Tools Coming
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {UPCOMING.map((u) => (
              <span
                key={u}
                className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {u}
              </span>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
