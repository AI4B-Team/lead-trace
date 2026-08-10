import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ToolShell } from "@/components/marketing/tool-shell";
import { Badge } from "@/components/ui/badge";
import { checkLineType } from "@/lib/free-tools.functions";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/tools/line-type-checker")({
  validateSearch: (search: Record<string, unknown>) => ({
    phone: typeof search.phone === "string" ? search.phone : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Free Line Type Checker — Mobile, Landline Or VoIP | LeadTrace" },
      { name: "description", content: "Look up whether a phone number is a mobile, landline, or VoIP line before you text it. Free carrier lookup, one number at a time." },
      { property: "og:title", content: "Free Line Type Checker" },
      { property: "og:description", content: "Mobile, landline, or VoIP — know before you spend a message credit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/tools/line-type-checker") }],
  }),
  component: LineTypeChecker,
});

function LineTypeChecker() {
  const check = useServerFn(checkLineType);
  const { phone } = Route.useSearch();
  return (
    <ToolShell
      initialPhone={phone ?? ""}
      eyebrow="Free Tool"
      title="Line Type Checker"
      blurb="Landline, mobile, or VoIP. Texting landlines wastes credits and drags down your sender reputation, so check before you send."
      action={(phone) => check({ data: { phone } })}
      render={(r) => (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="font-display text-lg font-bold text-foreground">{r.phone}</div>
            <Badge className="rounded-full" variant={r.lineType === "mobile" ? "default" : "secondary"}>
              {r.lineType === "mobile"
                ? "Mobile — Textable"
                : r.lineType === "landline"
                  ? "Landline — Not Textable"
                  : r.lineType === "voip"
                    ? "VoIP — Risky"
                    : "Unknown"}
            </Badge>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {r.carrier ? `Carrier ${r.carrier} · ` : ""}Source {r.provider}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {r.lineType === "mobile"
              ? "Good to text once it clears a DNC scrub."
              : "Keep it for cold calling. LeadTrace keeps these in your Clean List but pulls them out of the textable pool."}
          </p>
        </div>
      )}
      notes={[
        "Carrier data is a point-in-time lookup. Ported numbers can change line type between checks.",
        "VoIP lines are textable in theory but are the most common source of spam complaints, so we flag them separately.",
        "Inside LeadTrace this runs on your whole list automatically at the Textable stage of the pipeline.",
      ]}
      related={[
        { to: "/tools/dnc-checker", label: "DNC Number Checker" },
        { to: "/leads/landline-remover", label: "Landline Remover" },
        { to: "/how-it-works", label: "How The Pipeline Works" },
      ]}
    />
  );
}
