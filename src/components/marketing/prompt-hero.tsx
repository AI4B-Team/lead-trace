import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Upload, HardDrive, Send, X, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { stashPrompt } from "@/lib/prompt-handoff";
import type { Template } from "@/lib/templates";

const GENERIC_PLACEHOLDER =
  "Describe who you want to reach, paste a website, or upload a list…";

const ROTATING = [
  "HVAC contractors in Georgia, remove franchises…",
  "New probate filings in Hillsborough County FL, last 90 days…",
  "Roofers in every county in Texas, skip trace and scrub…",
  "Upload my CSV and clean it for a campaign…",
];

export function PromptHero({ selectedTemplate }: { selectedTemplate?: Template | null }) {
  const search = useSearch({ strict: false }) as { prompt?: string };
  const navigate = useNavigate();
  const [value, setValue] = useState(search.prompt ?? "");
  const [focused, setFocused] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  const stopTypingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync prefill from ?prompt= (template click)
  useEffect(() => {
    if (search.prompt && search.prompt !== value) {
      setValue(search.prompt);
      stopTypingRef.current = true;
      setPlaceholder("");
      const el = document.getElementById("prompt-hero-box");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.prompt]);

  // Ghost typing effect
  useEffect(() => {
    if (stopTypingRef.current) return;
    let exampleIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (stopTypingRef.current) return;
      const current = ROTATING[exampleIdx];
      if (!deleting) {
        charIdx++;
        setPlaceholder(current.slice(0, charIdx));
        if (charIdx === current.length) {
          deleting = true;
          timer = setTimeout(tick, 1600);
          return;
        }
        timer = setTimeout(tick, 45);
      } else {
        charIdx--;
        setPlaceholder(current.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          exampleIdx = (exampleIdx + 1) % ROTATING.length;
        }
        timer = setTimeout(tick, 25);
      }
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, []);

  const stopTyping = () => {
    stopTypingRef.current = true;
    setPlaceholder("");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) setFiles((f) => [...f, ...dropped]);
  };

  const submit = () => {
    const text = value.trim();
    if (!text && files.length === 0 && !selectedTemplate) return;
    // The prompt travels in the URL so it survives every auth path; the
    // sessionStorage stash is only a 10-minute fallback.
    if (text || selectedTemplate) stashPrompt(text, selectedTemplate?.id ?? null);
    navigate({
      to: "/start",
      search: {
        ...(text ? { prompt: text } : {}),
        ...(selectedTemplate ? { template: selectedTemplate.id } : {}),
        // Files cannot survive navigation, so send those users to the uploader.
        ...(files.length > 0 ? { upload: true } : {}),
      },
    });
  };

  return (
    <section className="relative overflow-hidden bg-background">
      {/* Dot grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #d4d4d8 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />
      <div className="relative mx-auto max-w-[77.5rem] px-6 pt-8 pb-4 md:pt-10 md:pb-6 text-center">
        <div className="inline-flex items-center text-primary text-xs font-semibold uppercase tracking-[0.18em]">
          Leads To Deals — On Autopilot
        </div>

        <div className="w-screen relative left-1/2 -translate-x-1/2">
          <h1 className="hero-headline mx-auto mt-6 px-4 font-body font-extrabold text-foreground leading-[1.05] tracking-tight lg:whitespace-nowrap">
            Find Them. <MarkerHighlight>Reach</MarkerHighlight> Them. Close Them.
          </h1>
        </div>
        <style>{`
          .hero-headline { font-size: clamp(34px, 5.2vw, 72px); }
        `}</style>
        <p className="mt-5 text-lg text-muted-foreground">
          Describe Who You Want To Reach And LeadTrace Builds The Whole Campaign.
        </p>

        {/* Smart prompt box */}
        <div
          id="prompt-hero-box"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="mx-auto mt-8 w-full max-w-[51.25rem] rounded-[1.375rem] bg-card text-card-foreground text-left transition"
          style={{
            border: `2px solid ${dragOver ? "#16A34A" : "#CC0000"}`,
          }}
        >
          <textarea
            value={value}
            onFocus={stopTyping}
            onChange={(e) => {
              stopTyping();
              setValue(e.target.value);
            }}
            placeholder={
              focused || value || stopTypingRef.current
                ? selectedTemplate?.placeholderHint ?? GENERIC_PLACEHOLDER
                : selectedTemplate
                  ? selectedTemplate.placeholderHint ?? GENERIC_PLACEHOLDER
                  : placeholder
            }
            onBlur={() => setFocused(false)}
            onFocusCapture={() => setFocused(true)}
            rows={3}
            className="w-full resize-none rounded-t-[1.25rem] bg-transparent px-6 pt-5 pb-2 text-lg leading-relaxed text-foreground placeholder:text-muted-foreground/70 outline-none"
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-5 pb-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 rounded-full bg-success/10 text-success border border-success/25 px-3 py-1 text-xs font-medium"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  {f.name}
                  <button
                    type="button"
                    onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                    className="hover:text-success/80"
                    aria-label="Remove File"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between px-4 pb-4 pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="grid place-items-center h-12 w-12 rounded-full border border-border bg-surface hover:bg-surface-muted text-foreground"
                aria-label="Add Attachment"
              >
                <Plus className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Upload File
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <HardDrive className="h-4 w-4 mr-2" /> Add From Drive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length) setFiles((f) => [...f, ...list]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-6 h-12 text-base shadow-sm"
            >
              <Send className="h-[1.125rem] w-[1.125rem]" />
              Build My List Free
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}