import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareQuote, RefreshCw, Sparkles, Loader2, Lightbulb, ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAgentQuestion } from "@/lib/bot-training.functions";
import {
  COACHING_PROMPTS,
  pickBuyerQuestions,
  type BuyerQuestion,
  type QuestionSource,
} from "@/lib/agent-questions.shared";

type Asked =
  | { kind: "buyer"; question: BuyerQuestion }
  | { kind: "custom"; question: string }
  | { kind: "coaching"; question: string };

function focusKnowledgeCard(key: string) {
  const el = document.getElementById(`knowledge-card-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary", "ring-offset-2");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2600);
}

/**
 * Compact, rotating set of buyer questions the agent can genuinely answer.
 * An unanswerable click becomes a pointer to the exact Knowledge Source card.
 */
export function AgentQuestionTester({
  brandId,
  sources,
}: {
  brandId: string;
  sources: QuestionSource[];
}) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000) + 1);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [custom, setCustom] = useState("");
  const ask = useServerFn(askAgentQuestion);

  const chips = useMemo(() => pickBuyerQuestions(sources, seed, 6), [sources, seed]);
  const trained = sources.length > 0;

  const run = useMutation({
    mutationFn: (v: { question: string; mode: "buyer" | "coaching" }) =>
      ask({ data: { brandId, question: v.question, mode: v.mode } }),
  });

  const askBuyer = (q: BuyerQuestion) => {
    setAsked({ kind: "buyer", question: q });
    run.mutate({ question: q.q, mode: "buyer" });
  };

  const askCustom = () => {
    const q = custom.trim();
    if (q.length < 3 || run.isPending) return;
    setAsked({ kind: "custom", question: q });
    run.mutate({ question: q.slice(0, 400), mode: "buyer" });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <MessageSquareQuote className="h-3.5 w-3.5" /> Try Asking Your Agent
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-full px-2 text-xs"
          onClick={() => setSeed(Math.floor(Math.random() * 100000) + 1)}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Shuffle
        </Button>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {trained
          ? "Click A Question — Your Agent Answers Only From The Knowledge You've Fed It."
          : "Add A Knowledge Source First — Right Now Your Agent Has Nothing To Answer From."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((q) => {
          const active = asked?.kind === "buyer" && asked.question.id === q.id;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => askBuyer(q)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface text-foreground hover:border-primary/60"
              }`}
            >
              “{q.q}”
            </button>
          );
        })}
      </div>

      {trained && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") askCustom();
            }}
            maxLength={400}
            placeholder="Or type your own question — e.g. Do you serve Miami?"
            className="h-9 rounded-full text-sm"
          />
          <Button
            size="sm"
            className="h-9 shrink-0 rounded-full px-4"
            disabled={custom.trim().length < 3 || run.isPending}
            onClick={askCustom}
          >
            {run.isPending && asked?.kind === "custom" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">Ask</span>
          </Button>
        </div>
      )}

      {asked && (
        <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Agent Reply
          </div>
          {run.isPending ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking Your Knowledge…
            </div>
          ) : run.isError ? (
            <p className="mt-2 text-sm text-destructive">Could Not Reach Your Agent. Try Again.</p>
          ) : run.data?.answered ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{run.data.answer}</p>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-foreground">
                Your Agent Doesn't Know This Yet — It Only Speaks From What You've Approved.
              </p>
              {asked.kind === "buyer" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 rounded-full"
                  onClick={() => focusKnowledgeCard(asked.question.gapCard)}
                >
                  Add It Under {asked.question.gapLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
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
                onClick={() => {
                  setAsked({ kind: "coaching", question: c });
                  run.mutate({ question: c, mode: "coaching" });
                }}
                className="rounded-full border border-dashed border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
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