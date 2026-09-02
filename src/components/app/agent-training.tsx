// ---------------------------------------------------------------------------
// Compact training surface for the AI Agent page: one ChatGPT-style composer
// (type / dictate / attach → Train Agent) plus a light Recent Training list.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, MicOff, Paperclip, Loader2, Trash2, Sparkles, Link2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addBotKnowledge, deleteBotKnowledge } from "@/lib/bot-training.functions";
import { TEXTUAL_FILE, type KnowledgeItem } from "@/lib/knowledge-cards.shared";
import { classifyKnowledge } from "@/lib/knowledge-classify";


type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// Collapses a doubled URL scheme (e.g. "https://https://site.com" or
// "https://http://site.com") down to the pasted URL's own scheme.
export function dedupeScheme(value: string): string {
  return value.replace(/\bhttps?:\/\/(?=https?:\/\/)/gi, "");
}

const EXAMPLES = [
  "Explain Your Services",
  "Paste Your FAQs",
  "Describe Your Ideal Customer",
  "Paste Your Sales Script",
  "What You Never Promise",
] as const;

export function AgentComposer({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const add = useServerFn(addBotKnowledge);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const insert = (snippet: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim()}\n${snippet}` : snippet));
    textRef.current?.focus();
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["bot-knowledge", `brand:${brandId}`] });

  useEffect(() => () => recRef.current?.stop(), []);

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) return toast.error("Dictation Not Supported In This Browser");
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) chunk += e.results[i][0].transcript;
      if (chunk.trim()) setText((prev) => (prev ? `${prev.trim()} ${chunk.trim()}` : chunk.trim()));
    };
    rec.onerror = () => {
      setListening(false);
      toast.error("Microphone Error");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const train = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      // Detect the knowledge category from the pasted text itself so the
      // readiness score (which counts category breadth) stays honest —
      // everything used to be hard-stamped "scripts".
      const detected = classifyKnowledge(text);
      await add({
        data: {
          brandId,
          items: [
            {
              source_type: listening ? ("voice" as const) : ("text" as const),
              category: detected.category,
              title: detected.title,
              content: text,
            },
          ],
        },
      });
      setText("");
      refresh();
      toast.success("Agent Trained", { description: `Saved As ${LABELS[detected.category] ?? detected.title}` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save Failed");
    } finally {
      setBusy(false);
    }
  };

  const attach = async (files: File[]) => {
    const usable = files.filter((f) => TEXTUAL_FILE.test(f.name) || f.type.startsWith("text/"));
    if (!usable.length) {
      return toast.error("Unsupported Files", {
        description: "Upload TXT, MD, CSV, JSON, HTML, XML, VTT Or SRT. Export PDFs To Text First.",
      });
    }
    setBusy(true);
    try {
      const items = await Promise.all(
        usable.slice(0, 25).map(async (f) => ({
          source_type: "file" as const,
          category: "documents",
          title: f.name.slice(0, 160),
          content: (await f.text()).slice(0, 200000),
        })),
      );
      const res = await add({ data: { brandId, items: items.filter((i) => i.content.trim().length > 0) } });
      toast.success(`${res.added} File${res.added === 1 ? "" : "s"} Added`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
    <div className="rounded-2xl border border-border bg-background p-3 shadow-sm">
      <Textarea
        ref={textRef}
        rows={3}
        value={text}
        onChange={(e) => setText(dedupeScheme(e.target.value))}
        placeholder="Paste anything — what you do, your FAQs, a sales script, a call transcript, or just your website link…"
        className="min-h-[84px] resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
      />
      <div className="mt-1 flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 rounded-full px-2.5 text-muted-foreground"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip className="mr-1 h-3.5 w-3.5" /> Attach Files
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 rounded-full px-2.5 text-muted-foreground"
          onClick={() => insert("https://")}
        >
          <Link2 className="mr-1 h-3.5 w-3.5" /> Paste Website
        </Button>
        <Button
          type="button"
          size="sm"
          variant={listening ? "default" : "ghost"}
          className={`h-8 rounded-full px-2.5 ${listening ? "" : "text-muted-foreground"}`}
          onClick={toggleMic}
        >
          {listening ? <><MicOff className="mr-1 h-3.5 w-3.5" /> Stop</> : <><Mic className="mr-1 h-3.5 w-3.5" /> Start Dictating</>}
        </Button>
        {listening && (
          <span className="flex items-center gap-1 text-[11px] text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Listening
          </span>
        )}
        <Button
          size="sm"
          className="ml-auto h-8 rounded-full"
          disabled={busy || !text.trim()}
          onClick={train}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
          Train Agent
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.vtt,.srt,.log,.yml,.yaml,text/*"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.currentTarget.value = "";
          if (files.length) void attach(files);
        }}
      />
    </div>
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Examples</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => insert(`${e}: `)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-muted"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just Now";
  if (mins < 60) return `${mins} Minutes Ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} Hour${hours === 1 ? "" : "s"} Ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} Days Ago`;
}

const LABELS: Record<string, string> = {
  website: "Website",
  documents: "Documents",
  calls: "Call Recording",
  scripts: "Sales Script",
  faqs: "FAQ",
  videos: "Video",
  emails: "Email Thread",
  catalog: "Product Catalog",
};

function TrainingItem({
  source,
  onDelete,
}: {
  source: KnowledgeItem;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group relative flex items-center gap-3 rounded-2xl border border-border bg-background p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {LABELS[source.category] ?? source.title}
        </div>
        <div className="text-xs text-muted-foreground">
          {source.title}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground/80">
          1 {LABELS[source.category] ?? "Item"} Added · {ago(source.created_at)}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 opacity-0 transition group-hover:opacity-100"
        onClick={() => onDelete(source.id)}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}

export function RecentTraining({ brandId, sources }: { brandId: string; sources: KnowledgeItem[] }) {
  const qc = useQueryClient();
  const remove = useServerFn(deleteBotKnowledge);
  const [all, setAll] = useState(false);
  const rows = all ? sources : sources.slice(0, 5);

  const del = async (id: string) => {
    try {
      await remove({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["bot-knowledge", `brand:${brandId}`] });
      toast.success("Source Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete Failed");
    }
  };

  if (!sources.length) {
    return <div className="text-sm text-muted-foreground">Nothing Trained Yet — Add Your First Source Above.</div>;
  }

  return (
    <div>
      <div className="grid gap-3">
        {rows.map((s) => (
          <TrainingItem key={s.id} source={s} onDelete={del} />
        ))}
      </div>
      {sources.length > 5 && (
        <Button variant="ghost" size="sm" className="mt-3 h-7 rounded-full px-2 text-xs" onClick={() => setAll(!all)}>
          {all ? "Show Less" : `Show All ${sources.length}`}
        </Button>
      )}
    </div>
  );
}
