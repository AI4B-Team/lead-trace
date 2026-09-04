import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquareQuote,
  RefreshCw,
  Loader2,
  Lightbulb,
  ArrowRight,
  Send,
  Bot,
  ShieldCheck,
  UserRound,
  NotebookPen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAgentQuestion } from "@/lib/bot-training.functions";
import {
  COACHING_PROMPTS,
  pickBuyerQuestions,
  type QuestionSource,
} from "@/lib/agent-questions.shared";

type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "agent";
      text: string;
      /** Set when the agent had no approved knowledge — trainer-only context. */
      gap?: { label: string; card: string } | null;
      unanswered?: boolean;
      /** AI service outage — not a knowledge gap; shown as an error, not a fallback. */
      unavailable?: boolean;
    };

/**
 * What a real lead would hear when the agent has no approved knowledge.
 * Natural and human — never reveals "I am a bot with limited training data".
 */
const LEAD_FACING_FALLBACK =
  "Great question — I want to make sure you get the right answer, so let me check with the team and get back to you shortly.";

function focusKnowledgeCard(key: string) {
  const el = document.getElementById(`knowledge-card-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary", "ring-offset-2");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2600);
}

/**
 * Chat-style tester: a running conversation with the trained agent.
 * Chips seed the input; unanswered turns show the natural lead-facing
 * fallback plus a trainer-only note pointing at the exact knowledge gap.
 */
export function AgentQuestionTester({
  brandId,
  sources,
}: {
  brandId: string;
  sources: QuestionSource[];
}) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000) + 1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coaching, setCoaching] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ask = useServerFn(askAgentQuestion);

  const chips = useMemo(() => pickBuyerQuestions(sources, seed, 4), [sources, seed]);
  const trained = sources.length > 0;

  const run = useMutation({
    mutationFn: (v: { question: string; mode: "buyer" | "coaching"; gap?: { label: string; card: string } | null }) =>
      ask({ data: { brandId, question: v.question, mode: v.mode } }),
    onSuccess: (data, v) => {
      setMessages((m) => [
        ...m,
        data.answered
          ? { role: "agent", text: data.answer }
          : (data as { unavailable?: boolean; detail?: string }).unavailable
            ? {
                role: "agent",
                text: `The AI service is unreachable right now — this is a system issue, not a knowledge gap. (${(data as { detail?: string }).detail ?? "Unknown cause"}.) Try again in a moment.`,
                unanswered: true,
                unavailable: true,
                gap: null,
              }
            : { role: "agent", text: LEAD_FACING_FALLBACK, unanswered: true, gap: v.gap ?? null },
      ]);
    },
    onError: () => {
      setMessages((m) => [
        ...m,
        { role: "agent", text: "Could not reach your agent. Try again.", unanswered: true, gap: null },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, run.isPending]);

  const send = (question: string, mode: "buyer" | "coaching", gap?: { label: string; card: string } | null) => {
    const q = question.trim();
    if (q.length < 1 || run.isPending) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    run.mutate({ question: q.slice(0, 400), mode, gap });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* ── Left rail: what this feature is ─────────────────────────── */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <MessageSquareQuote className="h-3.5 w-3.5" /> Chat With Your Agent
        </div>
        <p className="mt-2 text-sm font-medium leading-snug text-foreground">
          Talk to your agent exactly like a real lead would — before it ever texts a customer.
        </p>

        <div className="mt-4 space-y-2.5">
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xs font-semibold text-foreground">Approved knowledge only</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Every answer comes from what you have fed it — facts, prices and promises are never invented.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <UserRound className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xs font-semibold text-foreground">Sounds human, always</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Unknown questions get a natural reply — a lead never learns it is talking to a bot.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <NotebookPen className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xs font-semibold text-foreground">Gaps become to-dos</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Trainer notes under a reply point at the exact knowledge gap — one click to fill it.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-border p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Ask For Coaching
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Different job — these coach <span className="font-medium text-foreground">you</span> on handling a lead,
            not test what the agent knows.
          </p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {COACHING_PROMPTS.slice(0, coaching ? COACHING_PROMPTS.length : 2).map((c) => (
              <button
                key={c}
                type="button"
                disabled={run.isPending}
                onClick={() => send(c, "coaching")}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
          {COACHING_PROMPTS.length > 2 && (
            <button
              type="button"
              onClick={() => setCoaching((v) => !v)}
              className="mt-2 text-[11px] font-medium text-primary hover:underline"
            >
              {coaching ? "Show fewer" : `Show ${COACHING_PROMPTS.length - 2} more`}
            </button>
          )}
        </div>
      </div>

      {/* ── Right: the chat itself ──────────────────────────────────── */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-end gap-1">
          {messages.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-2 text-xs"
              onClick={() => setMessages([])}
            >
              Clear Chat
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-2 text-xs"
            onClick={() => setSeed(Math.floor(Math.random() * 100000) + 1)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Shuffle
          </Button>
        </div>

        <div className="flex h-[32rem] flex-col overflow-hidden rounded-2xl border border-border bg-background">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Bot className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-4 text-base font-semibold text-foreground">
                {trained ? "Talk to your agent like a real lead would" : "Your agent has nothing to answer from yet"}
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {trained
                  ? "It answers only from the knowledge you've fed it — nothing invented."
                  : "Add a knowledge source first, then come back and test it here."}
              </p>
              {trained && chips.length > 0 && (
                <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                  {chips.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      disabled={run.isPending}
                      onClick={() => send(q.q, "buyer", { label: q.gapLabel, card: q.gapCard })}
                      className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50"
                    >
                      &ldquo;{q.q}&rdquo;
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[75%] whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5 text-sm text-foreground">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.text}</div>
                      {m.unanswered && !m.unavailable && (
                        <div className="mt-2 text-[11px] leading-snug text-muted-foreground">
                          Trainer note: no approved knowledge covers this — a real lead would see the reply above.
                          {m.gap && (
                            <button
                              type="button"
                              className="ml-1 inline-flex items-center font-medium text-primary hover:underline"
                              onClick={() => focusKnowledgeCard(m.gap!.card)}
                            >
                              Add It Under {m.gap.label} <ArrowRight className="ml-0.5 h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
              {run.isPending && (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-1.5 pt-2">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-background px-4 py-3 sm:px-6">
          {messages.length > 0 && (
            <div className="mb-2.5 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {chips.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  disabled={run.isPending}
                  onClick={() => send(q.q, "buyer", { label: q.gapLabel, card: q.gapCard })}
                  className="shrink-0 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50"
                >
                  &ldquo;{q.q}&rdquo;
                </button>
              ))}
            </div>
          )}
          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-3xl border border-border bg-surface px-2 py-1.5 shadow-sm focus-within:border-primary/50">
            <Input
              value={draft}
              disabled={!trained}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft, "buyer");
                  setDraft("");
                }
              }}
              maxLength={400}
              placeholder={trained ? "Message your agent…" : "Add knowledge first to start chatting"}
              className="h-9 flex-1 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              disabled={draft.trim().length < 1 || run.isPending || !trained}
              aria-label="Send"
              onClick={() => {
                send(draft, "buyer");
                setDraft("");
              }}
            >
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mx-auto mt-1.5 max-w-2xl text-center text-[10px] text-muted-foreground">
            Your agent answers only from approved knowledge — it never invents facts, prices, or promises.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
