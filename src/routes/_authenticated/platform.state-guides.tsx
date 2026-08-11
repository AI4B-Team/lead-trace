import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { listStateGuidesAdmin, saveStateGuide } from "@/lib/state-guides.functions";
import type { StateGuideRow } from "@/lib/state-guides.shared";
import { stateName } from "@/lib/state-guides.shared";

export const Route = createFileRoute("/_authenticated/platform/state-guides")({
  head: () => ({
    meta: [
      { title: "State Guides — LeadTrace Platform" },
      {
        name: "description",
        content:
          "Edit the state-level Distress Feed content pages: law fields, steps, FAQs and publish state.",
      },
      { property: "og:title", content: "State Guides — LeadTrace Platform" },
      {
        property: "og:description",
        content: "Editorial content for state-level Distress Feed pages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StateGuidesAdmin,
});

type Draft = StateGuideRow & { stepsText: string; faqsText: string };

function toDraft(row: StateGuideRow): Draft {
  return {
    ...row,
    stepsText: JSON.stringify(row.steps ?? [], null, 2),
    faqsText: JSON.stringify(row.faqs ?? [], null, 2),
  };
}

function StateGuidesAdmin() {
  const qc = useQueryClient();
  const fetchGuides = useServerFn(listStateGuidesAdmin);
  const save = useServerFn(saveStateGuide);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");

  const guidesQ = useQuery({ queryKey: ["admin-state-guides"], queryFn: () => fetchGuides() });
  const rows = (guidesQ.data?.guides ?? []) as StateGuideRow[];

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(
      (r) =>
        r.state.toLowerCase().includes(f) ||
        stateName(r.state).toLowerCase().includes(f) ||
        r.record_type_slug.includes(f),
    );
  }, [rows, filter]);

  const mutate = useMutation({
    mutationFn: async (d: Draft) => {
      let steps: StateGuideRow["steps"];
      let faqs: StateGuideRow["faqs"];
      try {
        steps = JSON.parse(d.stepsText || "[]");
        faqs = JSON.parse(d.faqsText || "[]");
      } catch {
        throw new Error("Steps and FAQs must be valid JSON arrays.");
      }
      return save({
        data: {
          state: d.state,
          recordTypeSlug: d.record_type_slug,
          published: d.published,
          title: d.title,
          intro: d.intro,
          law_sale_type: d.law_sale_type,
          law_records_holder: d.law_records_holder,
          law_claim_window: d.law_claim_window,
          law_local_terminology: d.law_local_terminology,
          law_public_records_statute: d.law_public_records_statute,
          law_notes: d.law_notes,
          steps,
          faqs,
          what_is_body: d.what_is_body,
          how_pros_use_body: d.how_pros_use_body,
        },
      });
    },
    onSuccess: () => {
      toast.success("State guide saved.");
      void qc.invalidateQueries({ queryKey: ["admin-state-guides"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pick(row: StateGuideRow) {
    setSelected(row.id);
    setDraft(toDraft(row));
  }

  const field = (key: keyof Draft, label: string, textarea = false) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea
          rows={4}
          value={(draft?.[key] as string | null) ?? ""}
          onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
        />
      ) : (
        <Input
          value={(draft?.[key] as string | null) ?? ""}
          onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="State Guides"
        description="Editorial content for the state-level Distress Feed pages. Unpublished rows are noindex and stay out of the sitemap."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rows</CardTitle>
            <Input
              placeholder="Filter by state or record type"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mt-2"
            />
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-1 overflow-y-auto">
            {guidesQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                  selected === r.id ? "bg-surface-muted" : "hover:bg-surface-muted"
                }`}
              >
                <span className="truncate">
                  {r.state} · {r.record_type_slug}
                </span>
                <Badge
                  variant="outline"
                  className={r.published ? "border-success/40 text-success" : ""}
                >
                  {r.published ? "Live" : "Draft"}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {draft ? `${stateName(draft.state)} — ${draft.record_type_slug}` : "Select a row"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!draft ? (
              <p className="text-sm text-muted-foreground">
                Pick a state and record type to edit its page copy.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-md border border-border p-3">
                  <Switch
                    checked={draft.published}
                    onCheckedChange={(v) => setDraft((d) => (d ? { ...d, published: v } : d))}
                  />
                  <div className="text-xs">
                    <div className="font-semibold">Published</div>
                    <div className="text-muted-foreground">
                      Publish only when the law fields are verified and coverage is real.
                    </div>
                  </div>
                </div>

                {field("title", "Title")}
                {field("intro", "Intro (lede)", true)}
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("law_sale_type", "Law — Sale Type", true)}
                  {field("law_records_holder", "Law — Records Holder", true)}
                  {field("law_claim_window", "Law — Claim Window", true)}
                  {field("law_local_terminology", "Law — Local Terminology", true)}
                  {field("law_public_records_statute", "Law — Public Records Statute", true)}
                  {field("law_notes", "Law — Notes", true)}
                </div>
                {field("what_is_body", "What Is … prose", true)}
                {field("how_pros_use_body", "How Professionals Use It prose", true)}

                <div className="space-y-1">
                  <Label className="text-xs">
                    Steps (JSON: [{"{"} "heading", "body" {"}"}])
                  </Label>
                  <Textarea
                    rows={8}
                    className="font-mono text-xs"
                    value={draft.stepsText}
                    onChange={(e) => setDraft((d) => (d ? { ...d, stepsText: e.target.value } : d))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    FAQs (JSON: [{"{"} "question", "answer" {"}"}])
                  </Label>
                  <Textarea
                    rows={8}
                    className="font-mono text-xs"
                    value={draft.faqsText}
                    onChange={(e) => setDraft((d) => (d ? { ...d, faqsText: e.target.value } : d))}
                  />
                </div>

                <Button onClick={() => mutate.mutate(draft)} disabled={mutate.isPending}>
                  {mutate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
