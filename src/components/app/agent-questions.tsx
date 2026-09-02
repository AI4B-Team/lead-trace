import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareQuote, RefreshCw, Loader2, Lightbulb, ArrowRight, Send, Bot, User } from "lucide-react";
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
          : (data as { unavailable?: boolean }).unavailable
            ? {
                role: "agent",
                text: "The AI service is unreachable right now — this is a system issue, not a knowledge gap. Try again in a moment.",
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
    if (q.length < 3 || run.isPending) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    run.mutate({ question: q.slice(0, 400), mode, gap });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <MessageSquareQuote className="h-3.5 w-3.5" /> Chat With Your Agent
        </div>
        <div className="flex items-center gap-1">
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
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {trained
          ? "Talk To Your Agent Like A Real Lead Would — It Answers Only From The Knowledge You've Fed It."
          : "Add A Knowledge Source First — Right Now Your Agent Has Nothing To Answer From."}
      </p>

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border bg-surface px-4 py-4"
        >
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="flex max-w-[80%] items-start gap-2">
                  <div className="rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                    {m.text}
                  </div>
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="flex max-w-[85%] items-start gap-2">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-foreground">
                      {m.text}
                    </div>
                    {m.unanswered && !m.unavailable && (
                      <div className="mt-1.5 pl-1 text-[11px] leading-snug text-muted-foreground">
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
              </div>
            ),
          )}
          {run.isPending && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
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

      {trained && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                send(draft, "buyer");
                setDraft("");
              }
            }}
            maxLength={400}
            placeholder="Message your agent — e.g. Do you serve Miami?"
            className="h-9 rounded-full text-sm"
          />
          <Button
            size="sm"
            className="h-9 shrink-0 rounded-full px-4"
            disabled={draft.trim().length < 3 || run.isPending}
            onClick={() => {
              send(draft, "buyer");
              setDraft("");
            }}
          >
            {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span className="ml-1">Send</span>
          </Button>
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setCoaching((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          <Lightbulb className="h-3.5 w-3.5" /> Ask For Coaching
        </button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Different Job — These Coach You On Handling A Lead, Not Test What The Agent Knows.
        </p>
        {coaching && (
          <div className="mt-3 flex flex-wrap gap-2">
            {COACHING_PROMPTS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={run.isPending}
                onClick={() => send(c, "coaching")}
                className="rounded-full border border-dashed border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
