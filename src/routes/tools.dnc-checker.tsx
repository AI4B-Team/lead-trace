import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ToolShell } from "@/components/marketing/tool-shell";
import { Badge } from "@/components/ui/badge";
import { checkDncNumber } from "@/lib/free-tools.functions";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/tools/dnc-checker")({
  validateSearch: (search: Record<string, unknown>) => ({
    phone: typeof search.phone === "string" ? search.phone : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Free DNC Number Checker — National Registry Lookup | LeadTrace" },
      { name: "description", content: "Check any phone number against the National Do Not Call Registry and known litigator lists, free. One number at a time, no signup required." },
      { property: "og:title", content: "Free DNC Number Checker" },
      { property: "og:description", content: "Check a number against the DNC Registry and litigator lists before you text it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/tools/dnc-checker") }],
  }),
  component: DncChecker,
});

function DncChecker() {
  const check = useServerFn(checkDncNumber);
  const { phone } = Route.useSearch();
  return (
    <ToolShell
      initialPhone={phone ?? ""}
      eyebrow="Free Tool"
      title="DNC Number Checker"
      blurb="Paste a phone number and see whether it sits on the National Do Not Call Registry or a known litigator list before you ever hit send."
      action={(phone) => check({ data: { phone } })}
      render={(r) => (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="font-display text-lg font-bold text-foreground">{r.phone}</div>
            <Badge
              className="rounded-full"
              variant={r.status === "clean" ? "default" : r.status === "unknown" ? "secondary" : "destructive"}
            >
              {r.status === "clean"
                ? "Clean"
                : r.status === "dnc"
                  ? "On DNC Registry"
                  : r.status === "litigator"
                    ? "Known Litigator"
                    : "No Verdict"}
            </Badge>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Checked {new Date(r.checkedAt).toLocaleString()} · Provider {r.provider}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {r.status === "clean"
              ? "No registry hit. Still honor quiet hours and keep an opt-out in every message."
              : r.status === "unknown"
                ? "The registry did not return a verdict for this number. Treat it as unverified — inside LeadTrace an unverified number is held back from campaigns until it scrubs clean."
                : "Do not contact this number. Inside LeadTrace these records are blocked from campaigns automatically."}
          </p>
        </div>
      )}
      notes={[
        "Registry data changes daily. A clean result today is not a clean result next month — we re-scrub lists older than 30 days at launch.",
        "Every scrub inside LeadTrace is stamped with provider, timestamp, and reference ID so you can export the audit trail.",
        "Litigator hits are a hard block in the app. There is no path to add them to a campaign.",
      ]}
      related={[
        { to: "/tools/line-type-checker", label: "Line Type Checker" },
        { to: "/leads/dnc-list-scrubbing", label: "DNC List Scrubbing" },
        { to: "/compliance", label: "Our Compliance Posture" },
      ]}
    />
  );
}
