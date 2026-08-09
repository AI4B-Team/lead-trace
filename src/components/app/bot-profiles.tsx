import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  listBotProfiles, saveBotProfile, deleteBotProfile, duplicateBotProfile, previewAssembledPrompt,
} from "@/lib/bot-profiles.functions";
import { botProfileSchema, PROFILE_TEMPLATES, TEMPLATE_LABELS, type BotProfile } from "@/lib/bot-profiles.shared";
import { Copy, Eye, Plus, ShieldCheck, Trash2 } from "lucide-react";

type Row = BotProfile & { id: string; workspace_id: string | null };

const NONE = "__none__";

function lines(v: string): string[] {
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Template-scoped conversation profiles. Sender identity is unaffected. */
export function BotProfiles({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listBotProfiles);
  const save = useServerFn(saveBotProfile);
  const remove = useServerFn(deleteBotProfile);
  const duplicate = useServerFn(duplicateBotProfile);
  const preview = useServerFn(previewAssembledPrompt);

  const [template, setTemplate] = useState<string>("distress_feed");
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [dupTarget, setDupTarget] = useState<Row | null>(null);
  const [dupTemplate, setDupTemplate] = useState<string>("google_maps");

  const { data, isLoading } = useQuery({
    queryKey: ["bot-profiles", workspaceId],
    queryFn: () => list({ data: { workspaceId } }) as Promise<Row[]>,
    enabled: !!workspaceId,
  });

  const rows = useMemo(
    () => (data ?? []).filter((r) => (r.template_id ?? NONE) === (template === NONE ? NONE : template)),
    [data, template],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["bot-profiles", workspaceId] });

  const saveMut = useMutation({
    mutationFn: async (row: Partial<Row>) => {
      const profile = botProfileSchema.parse({ ...row, workspace_id: workspaceId });
      return save({ data: { workspaceId, profile: { ...profile, id: row.id } } });
    },
    onSuccess: () => { toast.success("Profile Saved"); setEditing(null); invalidate(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could Not Save Profile"),
  });

  const showPrompt = async (row: Row) => {
    try {
      const res = await preview({
        data: {
          workspaceId,
          profile: botProfileSchema.parse(row),
          regulated: false,
          recordContext: "Example: probate case filed 2026-03-04 in Orange County, FL. Property vacant.",
        },
      });
      setPromptText(res.prompt);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Assemble Prompt");
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-display text-lg font-bold text-foreground">Conversation Profiles</div>
            <p className="text-sm text-muted-foreground mt-1">
              One Profile Per Lead Source. A Probate Owner And A Roofing Company Are Not The Same Conversation.
              Profiles Change What Your Agent Says — Never Which Number Or Brand It Sends From.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROFILE_TEMPLATES.map((t) => (
                  <SelectItem key={t} value={t}>{TEMPLATE_LABELS[t]}</SelectItem>
                ))}
                <SelectItem value={NONE}>Workspace Default</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="rounded-full"
              onClick={() =>
                setEditing({
                  name: "",
                  opener: "",
                  template_id: template === NONE ? null : template,
                  record_type: null,
                  is_default: template === NONE,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1.5" /> New Profile
            </Button>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading Profiles…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No Profile For This Source Yet.
            </div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{row.name}</span>
                  {row.record_type ? <Badge variant="secondary">{row.record_type}</Badge> : null}
                  {row.is_default ? <Badge variant="outline">Workspace Default</Badge> : null}
                  {!row.workspace_id ? <Badge variant="outline">Platform Default</Badge> : null}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => showPrompt(row)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Prompt
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setDupTarget(row); setDupTemplate(row.template_id ?? "google_maps"); }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
                    </Button>
                    {row.workspace_id ? (
                      <>
                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing(row)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await remove({ data: { workspaceId, id: row.id } });
                            toast.success("Profile Removed");
                            invalidate();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing({ ...row, id: undefined, workspace_id: workspaceId, name: `${row.name} (Ours)` })}>
                        Customize
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{row.opener}</p>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Platform Guardrails Always Run First. A Profile Can Make Your Agent More Cautious — It Can Never Switch
            Off Opt-Out Handling, Handoff Rules, Or The Unsafe-Claim Filter.
          </span>
        </div>
      </CardContent>

      <ProfileEditor
        value={editing}
        onClose={() => setEditing(null)}
        onSave={(row) => saveMut.mutate(row)}
        saving={saveMut.isPending}
      />

      <Dialog open={!!promptText} onOpenChange={(o) => !o && setPromptText(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assembled System Prompt</DialogTitle></DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs text-foreground">
            {promptText}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dupTarget} onOpenChange={(o) => !o && setDupTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Duplicate To New Template</DialogTitle></DialogHeader>
          <Label>Target Source</Label>
          <Select value={dupTemplate} onValueChange={setDupTemplate}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROFILE_TEMPLATES.map((t) => (
                <SelectItem key={t} value={t}>{TEMPLATE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              className="rounded-full"
              onClick={async () => {
                if (!dupTarget) return;
                try {
                  await duplicate({
                    data: {
                      workspaceId,
                      sourceId: dupTarget.id,
                      templateId: dupTemplate,
                      recordType: null,
                      name: `${dupTarget.name} — ${TEMPLATE_LABELS[dupTemplate]}`,
                    },
                  });
                  toast.success("Profile Duplicated");
                  setDupTarget(null);
                  invalidate();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could Not Duplicate");
                }
              }}
            >
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ProfileEditor({
  value, onClose, onSave, saving,
}: {
  value: Partial<Row> | null;
  onClose: () => void;
  onSave: (row: Partial<Row>) => void;
  saving: boolean;
}) {
  const [row, setRow] = useState<Partial<Row> | null>(value);
  // Re-seed the form whenever a different profile is opened.
  const key = value?.id ?? value?.name ?? "new";
  const [seeded, setSeeded] = useState(key);
  if (seeded !== key) { setSeeded(key); setRow(value); }

  const set = (patch: Partial<Row>) => setRow((r) => ({ ...(r ?? {}), ...patch }));
  if (!value || !row) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{row.id ? "Edit Profile" : "New Profile"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Profile Name</Label>
              <Input value={row.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Probate Sellers" />
            </div>
            <div>
              <Label>Record Type (Optional)</Label>
              <Input
                value={row.record_type ?? ""}
                onChange={(e) => set({ record_type: e.target.value || null })}
                placeholder="probate"
              />
            </div>
          </div>
          <div>
            <Label>Opener</Label>
            <Textarea rows={3} value={row.opener ?? ""} onChange={(e) => set({ opener: e.target.value })} />
          </div>
          <div>
            <Label>Context Framing</Label>
            <Textarea
              rows={3}
              value={row.context_framing ?? ""}
              onChange={(e) => set({ context_framing: e.target.value || null })}
              placeholder="How the agent explains why it's reaching out."
            />
          </div>
          <div>
            <Label>Tone</Label>
            <Input value={row.tone ?? ""} onChange={(e) => set({ tone: e.target.value || null })} />
          </div>
          <div>
            <Label>Objections — One Per Line, "Trigger | Approved Response"</Label>
            <Textarea
              rows={6}
              value={(row.objections ?? []).map((o) => `${o.trigger} | ${o.approved_response}`).join("\n")}
              onChange={(e) =>
                set({
                  objections: lines(e.target.value).map((l) => {
                    const [t, ...rest] = l.split("|");
                    return { trigger: (t ?? "").trim(), approved_response: rest.join("|").trim() };
                  }),
                })
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Screening Questions — One Per Line</Label>
              <Textarea
                rows={4}
                value={(row.screening_questions ?? []).join("\n")}
                onChange={(e) => set({ screening_questions: lines(e.target.value) })}
              />
            </div>
            <div>
              <Label>FAQs — "Question | Answer"</Label>
              <Textarea
                rows={4}
                value={(row.faqs ?? []).map((f) => `${f.q} | ${f.a}`).join("\n")}
                onChange={(e) =>
                  set({
                    faqs: lines(e.target.value).map((l) => {
                      const [q, ...rest] = l.split("|");
                      return { q: (q ?? "").trim(), a: rest.join("|").trim() };
                    }),
                  })
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Escalation Triggers</Label>
              <Textarea
                rows={4}
                value={(row.escalation_triggers ?? []).join("\n")}
                onChange={(e) => set({ escalation_triggers: lines(e.target.value) })}
              />
            </div>
            <div>
              <Label>Banned Topics</Label>
              <Textarea
                rows={4}
                value={(row.banned_topics ?? []).join("\n")}
                onChange={(e) => set({ banned_topics: lines(e.target.value) })}
              />
            </div>
            <div>
              <Label>Dispositions</Label>
              <Textarea
                rows={4}
                value={(row.dispositions ?? []).join("\n")}
                onChange={(e) => set({ dispositions: lines(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full" disabled={saving} onClick={() => onSave(row)}>
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
