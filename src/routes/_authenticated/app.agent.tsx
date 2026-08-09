import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SampleQuestions } from "@/components/app/brand-knowledge";
import { KnowledgeSourceList } from "@/components/app/knowledge-cards";
import { AgentComposer, RecentTraining } from "@/components/app/agent-training";
import { agentReadiness, openKnowledgeSource } from "@/lib/agent-readiness";
import { AgentQuestionTester } from "@/components/app/agent-questions";
import { BotProfiles } from "@/components/app/bot-profiles";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { useWorkspaceAgent } from "@/hooks/use-agent";
import { createBrand } from "@/lib/brands.functions";
import { listBotKnowledge } from "@/lib/bot-training.functions";
import { ArrowRight, Bot, CheckCircle2, Globe, MessageSquareQuote, RefreshCw, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/agent")({
  head: () => ({
    meta: [
      { title: "AI Agent — LeadTrace" },
      {
        name: "description",
        content:
          "Teach your LeadTrace AI agent your business — website, documents, scripts, transcripts and FAQs — so every reply comes from approved knowledge.",
      },
      { property: "og:title", content: "AI Agent — LeadTrace" },
      { property: "og:description", content: "Your agent only ever speaks from knowledge you approve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentPage,
});

function formatWhen(iso?: string) {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just Now";
  if (mins < 60) return `${mins} Minutes Ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} Hour${hours === 1 ? "" : "s"} Ago`;
  const days = Math.round(hours / 24);
  return `${days} Day${days === 1 ? "" : "s"} Ago`;
}

/** The trust hook — the agent never invents anything. */
function NothingInvented() {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-2.5">
      <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="text-sm text-muted-foreground">
        <span className="font-display font-bold text-foreground">Nothing Invented.</span> Every Response, Objection,
        FAQ, Offer, And Appointment Comes From Your Approved Company Knowledge.
      </div>
    </div>
  );
}

function AgentSetup({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createBrand);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Name Your Agent");
    setSaving(true);
    try {
      await create({ data: { workspaceId, name: name.trim(), website, description } });
      await qc.invalidateQueries({ queryKey: ["brands", workspaceId] });
      toast.success("Agent Created", { description: "Now Feed It Your Knowledge Below." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could Not Create Agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </span>
            <div className="font-display text-lg font-bold text-foreground">Your Business</div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <Label>Business Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Summit Roofing" />
            </div>
            <div>
              <Label>Website (Optional)</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://summitroofing.com" />
              <div className="text-[11px] text-muted-foreground mt-1">Add Pages As URL Sources After Setup.</div>
            </div>
          </div>
          <div className="mt-4">
            <Label>What You Offer (Optional)</Label>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who you serve, what you sell, how you talk, what you never promise…"
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button className="rounded-full" onClick={submit} disabled={saving}>
              {saving ? "Creating…" : "Create My Agent"}
            </Button>
            <span className="text-xs text-muted-foreground">Takes Under 2 Minutes — Training Comes Next.</span>
          </div>

          <div className="mt-6">
            <NothingInvented />
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <MessageSquareQuote className="h-3.5 w-3.5" /> What You'll Be Able To Ask
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Once Your Agent Is Created And Trained, You Can Test It With Questions Like These.
            </p>
            <div className="mt-3">
              <SampleQuestions />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4">
        <h2 className="font-display text-xl font-bold text-foreground">Improve Your Agent</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Feed Your Agent Any Of These — It Only Speaks From What You Approve.
        </p>
      </div>
      <KnowledgeSourceList />
    </>
  );
}

function AgentPage() {
  const { workspaceId } = useWorkspaceId();
  const qc = useQueryClient();
  const { agent, loading } = useWorkspaceAgent(workspaceId);
  const fetchKnowledge = useServerFn(listBotKnowledge);

  const { data: knowledge } = useQuery({
    queryKey: ["bot-knowledge", `brand:${agent?.id}`],
    queryFn: () => fetchKnowledge({ data: { brandId: agent!.id } }),
    enabled: !!agent,
  });
  const sources = knowledge ?? [];
  const readiness = agentReadiness(sources);
  const score = readiness.score;
  const lastTrained = sources[0]?.created_at;

  return (
    <div>
      <PageHeader
        title={agent ? "AI Agent" : "Set Up Your AI Agent"}
        description={
          agent
            ? "Train It Once — Then Every Reply Sounds Like Your Best Salesperson."
            : "Teach It Everything About Your Business — It Only Ever Speaks From What You Approve."
        }
        actions={
          agent ? (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => qc.invalidateQueries({ queryKey: ["brands", workspaceId] })}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          ) : undefined
        }
      />

      {!workspaceId || loading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">Loading Your Agent…</CardContent>
        </Card>
      ) : !agent ? (
        <AgentSetup workspaceId={workspaceId} />
      ) : (
        <>
          {/* 1 — Agent Health: readiness is the hero metric */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bot className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-xl font-bold leading-tight text-foreground">{agent.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      Last Trained {formatWhen(lastTrained)} · {sources.length} Source{sources.length === 1 ? "" : "s"}
                      {agent.website && (
                        <>
                          {" · "}
                          <span className="inline-flex items-center gap-1 align-middle">
                            <Globe className="h-3 w-3" /> {agent.website}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Readiness
                    </div>
                    <div className="font-display text-5xl font-black leading-none tabular-nums text-foreground">
                      {score}%
                    </div>
                  </div>
                  <div className="pb-1 text-right text-sm font-semibold text-foreground">
                    {readiness.state === "Well-Trained" ? (
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <CheckCircle2 className="h-4 w-4" /> Well-Trained
                      </span>
                    ) : (
                      readiness.state
                    )}
                    <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                      {readiness.coveredCount} Of 8 Source Types Covered
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${score}%` }} />
                </div>

                {/* Next step by coverage, never by character quota. */}
                {readiness.nextGap ? (
                  <button
                    type="button"
                    onClick={() => openKnowledgeSource(readiness.nextGap!.key)}
                    className="mt-4 flex w-full items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-left transition hover:border-primary/50 hover:bg-primary/5"
                  >
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Biggest Gap — {readiness.nextGap.label}
                      </span>
                      <span className="mt-0.5 block text-sm font-medium text-foreground">
                        {readiness.nextGap.capability}.
                      </span>
                    </span>
                  </button>
                ) : (
                  <div className="mt-4 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">
                    Every Source Type Has Real Content. Keep Adding Real Conversations And Answers — An Agent Is Never Finished.
                  </div>
                )}

                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Your Agent Only Answers From Knowledge You Approve — Nothing Invented.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Knowledge
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {readiness.coveredCount} Of 8 Sources Added
                  </div>
                </div>
                <div className="mt-3 divide-y divide-border">
                  {readiness.depths.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => openKnowledgeSource(d.key)}
                      className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm transition hover:text-primary"
                    >
                      <span className="truncate text-foreground">{d.label}</span>
                      <span
                        className={`shrink-0 text-xs tabular-nums ${
                          d.covered
                            ? "font-medium text-foreground"
                            : d.thin
                              ? "font-medium text-warn"
                              : "text-muted-foreground/70"
                        }`}
                      >
                        {d.detail}
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 2 — Train Your Agent */}
          <div className="mt-8">
            <h2 className="font-display text-xl font-bold text-foreground">Train Your Agent</h2>
            <p className="mt-1 text-sm text-muted-foreground">Paste, Attach, Or Dictate Anything About Your Business.</p>
            <div className="mt-3">
              <AgentComposer key={agent.id} brandId={agent.id} />
            </div>
          </div>

          {/* 3 — Try Your Agent */}
          <Card className="mt-8">
            <CardContent className="pt-6">
              <AgentQuestionTester brandId={agent.id} sources={sources} />
            </CardContent>
          </Card>

          {/* 3.5 — Conversation Profiles, scoped per lead source */}
          <div className="mt-8">
            <BotProfiles workspaceId={workspaceId} />
          </div>

          {/* 4 — Improve Your Agent */}
          <div className="mt-8">
            <h2 className="font-display text-xl font-bold text-foreground">Improve Your Agent</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything Your Agent Knows, By Source — Click Any Row To Add Or Manage It.
            </p>
            <div className="mt-3">
              <KnowledgeSourceList brandId={agent.id} sources={sources} />
            </div>
          </div>

          {/* 5 — Recent Training */}
          <div className="mt-8">
            <h2 className="font-display text-xl font-bold text-foreground">Recent Training</h2>
            <p className="mt-1 text-sm text-muted-foreground">Every Lesson Your Agent Has Learned, Newest First.</p>
            <div className="mt-3">
              <RecentTraining brandId={agent.id} sources={sources} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
