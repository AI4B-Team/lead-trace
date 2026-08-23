import { z } from "zod";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { JobSpecCard } from "@/components/app/job-spec-card";
import { AssistantTrace, buildTraceSteps, ctaBlockers, openSlots } from "@/components/app/assistant-trace";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UploadIntentDialog } from "@/components/app/upload-intent-dialog";
import { COMPOSER_EXAMPLES, COMPOSER_EXAMPLE_MS } from "@/lib/composer-examples";
import {
  TARGET_KIND_LABEL, detectUploadIntent, suppressionKeysFrom, targetValuesFrom,
  type IntentDetection, type TargetKind, type UploadIntent,
} from "@/lib/upload-intent";
import { toast } from "sonner";
import {
  Sparkles, ChevronDown, Play, CornerDownLeft, CheckCircle2, RotateCcw, SlidersHorizontal,
  Paperclip, Mic, Send, BellPlus, Loader2, Check, CreditCard,
} from "lucide-react";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { useCreditBalances } from "@/hooks/use-credit-balances";
import { FirstRunSetup } from "@/components/app/getting-started";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { queueUploadJob } from "@/lib/upload-jobs.functions";
import { getJobCoverage } from "@/lib/coverage.functions";
import { inferChannel } from "@/lib/channels";
import { ColumnMapperDialog } from "@/components/app/column-mapper";
import {
  attachmentReady, attachmentRows, isSpreadsheet, readAttachment, type UploadAttachment,
} from "@/lib/upload-attachment";
import type { ColumnMap } from "@/lib/csv";
import { assistantChat, createJobFromSpec, requestCoverage, listAdapterRequests } from "@/lib/assistant.functions";
import { SourceRequestDialog, type SourceRequestType } from "@/components/app/source-request-dialog";
import { runJob } from "@/lib/pipeline.functions";
import { EMPTY_SPEC, describeSpec, patchSpec, specStates, type Coverage, type JobSpec } from "@/lib/assistant.shared";
import { PIPELINE_OPTION_LABELS, withEnrichmentDefaults } from "@/lib/pipeline-options";
import { estimateSpec, MAX_ROWS_PRESETS } from "@/lib/estimate.shared";
import { PipelineFunnel } from "@/components/app/pipeline-funnel";
import { DEFAULT_MATCH_THRESHOLD, estimateScan } from "@/lib/property-scan.shared";
import { DEFAULT_MAX_ROWS, loadMaxRows, saveMaxRows } from "@/lib/max-rows";
import { clearDraft, loadDraft, saveDraft, type ThreadItem } from "@/lib/assistant-draft";
import { TEMPLATES, creditCostPerLead, featuredTemplates, getTemplate, hasCategory, templateSourceType, type Template } from "@/lib/templates";
import { FreeTierNotice } from "@/components/app/free-tier-notice";
import { usePlanContext } from "@/hooks/use-plan-context";
import { TemplateCard } from "@/components/marketing/template-card";
import { useTemplateCoverage } from "@/hooks/use-template-coverage";
import { TemplatePickerDialog } from "@/components/app/template-picker-dialog";
import { templateAdapterStatus } from "@/lib/template-schema";
import { useOverflow } from "@/hooks/use-overflow";
import { US_STATES, countiesForState } from "@/lib/us-geo";
import { loadRecentTemplates, touchRecentTemplate, type RecentTemplate } from "@/lib/recent-templates";
import { takeStashedHandoff, clearStashedPrompt } from "@/lib/prompt-handoff";
import { useTeamContext } from "@/hooks/use-team-context";
import { denialMessage } from "@/lib/team-roles.shared";
import { MarketplaceSetup } from "@/components/app/marketplace/marketplace-setup";

export const Route = createFileRoute("/_authenticated/app/assistant")({
  validateSearch: z.object({
    prompt: z.string().optional(),
    fill: z.string().optional(),
    template: z.string().optional(),
    /** Pre-set the List Builder source (business | records | upload). */
    source: z.string().optional(),
    niche: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "AI Lead Assistant — LeadTrace" },
      { name: "description", content: "Describe the leads you want in plain English. The LeadTrace assistant assembles a compliant, runnable list you can review before running." },
      { property: "og:title", content: "AI Lead Assistant — LeadTrace" },
      { property: "og:description", content: "Watch the assistant interpret plain English into a structured, editable list of settings. You always click Generate List." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssistantRoute,
});

/**
 * Marketplace Deals is a Template Library card that opens its own focused setup
 * flow inside this surface — it does not use the List Builder spec at all.
 */
function AssistantRoute() {
  const { template } = Route.useSearch();
  if (template === "marketplace-deals") return <MarketplaceSetup />;
  return <Assistant />;
}

/** The starter grid is curated, not array order: featured templates only. */
const DEFAULT_GRID_IDS = featuredTemplates().map((t) => t.id);
const GRID_SLOTS = DEFAULT_GRID_IDS.length;

const FIELD_LABELS: Partial<Record<keyof JobSpec, string>> = {
  sourceType: "Source",
  niches: "Niches",
  recordType: "Record Type",
  state: "State",
  counties: "Counties",
  recencyDays: "Recency",
  maxResults: "Max Leads",
  // Toggle names come from the shared config so chips match the panel and checklist.
  removeFranchises: PIPELINE_OPTION_LABELS.removeFranchises,
  dedupe: PIPELINE_OPTION_LABELS.dedupe,
  mobileOnly: PIPELINE_OPTION_LABELS.mobileOnly,
  skipTrace: PIPELINE_OPTION_LABELS.skipTrace,
  emailRequired: PIPELINE_OPTION_LABELS.emailRequired,
  industry: "Industry Preset",
  messageAngle: "First-Touch Angle",
};

/** Plain-language list of what a manual panel edit changed, for the thread chip. */
function diffSpec(prev: JobSpec, next: JobSpec): string[] {
  return (Object.keys(FIELD_LABELS) as Array<keyof JobSpec>)
    .filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]))
    .map((k) => FIELD_LABELS[k]!);
}

const GENERIC_PLACEHOLDER =
  "Describe The Leads You Want. E.g. Roofing Companies In Hillsborough County With Mobile Numbers.";

/** Placeholder follows the conversation state, never a stale example. */
const REFINE_PLACEHOLDER = "Refine this list, or describe a new one…";
const RUNNING_PLACEHOLDER = "Ask me anything, or start your next list…";

/**
 * Cycles the composer's example placeholder with a crossfade. Paused while the
 * user types or a template is selected, so the rotation never fights real input.
 */
function useRotatingExample(active: boolean) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!active) { setI(0); setVisible(true); return; }
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setI((n) => (n + 1) % COMPOSER_EXAMPLES.length);
        setVisible(true);
      }, 320);
    }, COMPOSER_EXAMPLE_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return { text: COMPOSER_EXAMPLES[i] ?? COMPOSER_EXAMPLES[0], visible };
}

/**
 * Light slot check used only when a template is selected: the template already
 * knows the source, so all we need from the operator is the "who" and "where".
 */
function missingSlots(text: string, spec: JobSpec) {
  const t = text.toLowerCase();
  const hasGeo =
    specStates(spec).length > 0 ||
    spec.counties.length > 0 ||
    /\b(county|counties|city|zip|statewide)\b/.test(t) ||
    US_STATES.some((s) => new RegExp(`\\b(${s.code.toLowerCase()}|${s.name.toLowerCase()})\\b`).test(t));
  const hasSubject =
    spec.niches.length > 0 || Boolean(spec.recordType) || text.trim().split(/\s+/).length >= 3;
  return { geo: !hasGeo, subject: !hasSubject };
}

function Assistant() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { workspaceId } = useWorkspaceId();
  const team = useTeamContext();
  const chat = useServerFn(assistantChat);
  const createJob = useServerFn(createJobFromSpec);
  const logRequest = useServerFn(requestCoverage);
  const fetchAdapterRequests = useServerFn(listAdapterRequests);
  const runJobFn = useServerFn(runJob);

  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [input, setInput] = useState("");
  const [spec, setSpec] = useState<JobSpec>(EMPTY_SPEC);
  const [firstPrompt, setFirstPrompt] = useState("");
  const [coverage, setCoverage] = useState<Array<{ county: string; coverage: Coverage }>>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [revealed, setRevealed] = useState(0);
  /** True once the assistant has stated the full spec back in prose. */
  const [specStated, setSpecStated] = useState(false);
  /** Panel edits waiting to be acknowledged by the next assistant turn. */
  const [panelEdits, setPanelEdits] = useState<string[]>([]);
  const [recents, setRecents] = useState<RecentTemplate[]>([]);
  const { isComingSoon } = useTemplateCoverage();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [convId, setConvId] = useState<string>(() => `c${Date.now()}`);
  /** Keys the assistant inferred this conversation (drives the % badges). */
  const [inferred, setInferred] = useState<Set<keyof JobSpec>>(new Set());
  const [allOpen, setAllOpen] = useState(false);
  /** Panel-only mode: the List Builder is open with no chat message yet. */
  const [panelOpen, setPanelOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  /** Inline upload state — survives a source switch so it can be restored. */
  const [upload, setUpload] = useState<UploadAttachment | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  /** File read but awaiting an intent choice before it changes anything. */
  const [pendingUpload, setPendingUpload] = useState<UploadAttachment | null>(null);
  const [pendingDetection, setPendingDetection] = useState<IntentDetection | null>(null);
  /** Beta waitlist: template ids already requested + the notify address. */
  const [requestedAdapters, setRequestedAdapters] = useState<Set<string>>(new Set());
  const [sourceRequest, setSourceRequest] = useState<{
    type: SourceRequestType;
    templateId: string | null;
    label: string;
    geo: string;
  } | null>(null);
  const [notifyEmail, setNotifyEmail] = useState<string | null>(null);
  // Submission state now lives inside the source-request intake dialog.
  const [requestError, setRequestError] = useState<string | null>(null);
  const lastTemplateId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentPrompt = useRef(false);
  /** Handoff text waiting for its template selection to land before sending. */
  const pendingHandoff = useRef<{ templateId: string; text: string } | null>(null);
  const restored = useRef(false);
  const appliedSource = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const specScroll = useOverflow<HTMLDivElement>();
  // One-time "Scroll for more" nudge: auto-dismisses after 4s, on first scroll,
  // or immediately when the viewer prefers reduced motion.
  const [nudgeVisible, setNudgeVisible] = useState(true);
  useEffect(() => {
    if (!nudgeVisible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNudgeVisible(false);
      return;
    }
    const t = setTimeout(() => setNudgeVisible(false), 4000);
    return () => clearTimeout(t);
  }, [nudgeVisible]);

  const started = thread.length > 0 || panelOpen;
  /** True only once a message exists in the thread (panel-only mode has none). */
  const hasChat = thread.length > 0;
  const traceSteps = useMemo(() => buildTraceSteps(spec), [spec]);
  const uploadReady = attachmentReady(upload);
  const missing = useMemo(() => openSlots(spec, uploadReady, selectedTemplate), [spec, uploadReady, selectedTemplate]);
  /** What genuinely blocks the run, named. Empty = the CTA must be enabled. */
  const blockers = useMemo(
    () => ctaBlockers(spec, uploadReady, selectedTemplate),
    [spec, uploadReady, selectedTemplate],
  );
  /** Honest availability: a non-live adapter can never reach the pipeline. */
  const adapterStatus = selectedTemplate ? templateAdapterStatus(selectedTemplate) : "live";
  const adapterLive = adapterStatus === "live";
  // The List Assembled card only appears after the assistant has read the spec
  // back in words, so the operator always gets a turn to correct it first.
  const traceComplete =
    revealed >= traceSteps.length &&
    !busy &&
    traceSteps.length > 0 &&
    missing.length === 0 &&
    (specStated || !hasChat);
  const lastAssistantIndex = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i -= 1) if (thread[i].role === "assistant") return i;
    return -1;
  }, [thread]);

  useEffect(() => {
    composer.current?.focus();
  }, [started]);

  useEffect(() => {
    setMicSupported(
      typeof window !== "undefined" &&
        Boolean((window as unknown as Record<string, unknown>).SpeechRecognition ||
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition),
    );
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    setRecents(loadRecentTemplates(workspaceId));
  }, [workspaceId]);

  /**
   * Template selection sets context, never composer text. Picking a template
   * marks it selected, swaps the placeholder to a fill-in example, and presets
   * only the spec fields the template already determines (the source).
   */
  const selectTemplate = (t: Template) => {
    setAllOpen(false);
    if (selectedTemplate?.id === t.id) {
      setSelectedTemplate(null);
      lastTemplateId.current = null;
      if (!hasChat) {
        setSpec(EMPTY_SPEC);
        setInferred(new Set());
      }
      requestAnimationFrame(() => composer.current?.focus());
      return;
    }
    setSelectedTemplate(t);
    lastTemplateId.current = t.id;
    if (hasChat) {
      // Mid-conversation: the template only informs the source, never wipes context.
      setSpec((s) =>
        withEnrichmentDefaults({ ...s, sourceType: templateSourceType(t), templateId: t.id }, t.id),
      );
      setInferred((prev) => {
        const next = new Set(prev);
        next.delete("sourceType");
        return next;
      });
    } else {
      // Fresh context: reset everything, then apply only what the template determines.
      if (workspaceId) clearDraft(workspaceId);
      setConvId(`c${Date.now()}`);
      setThread([]);
      setFirstPrompt("");
      setCoverage([]);
      setSuggested([]);
      setConfirmed(false);
      setRevealed(0);
      setInferred(new Set());
      setSpec(
        withEnrichmentDefaults({ ...EMPTY_SPEC, sourceType: templateSourceType(t), templateId: t.id }, t.id),
      );
      setUpload(null);
    }
    if (workspaceId) setRecents(touchRecentTemplate(workspaceId, t.id));
    requestAnimationFrame(() => composer.current?.focus());
  };

  /** Note a file in the thread, opening the working view when chat is empty. */
  const noteAttachment = (system: string, assistant: string, nextSpec: JobSpec) => {
    if (hasChat) {
      setThread((m) => [...m, { role: "system", content: system }, { role: "assistant", content: assistant, spec: nextSpec }]);
    } else {
      setThread([
        { role: "system", content: system },
        { role: "assistant", content: assistant, spec: nextSpec },
      ]);
    }
  };

  /**
   * Intent 1 & 2 — the file becomes rows in the pipeline. "Enrich" is the same
   * mechanism as "import", framed as gap-filling on a list the user owns.
   */
  const applyUploadAsLeads = (next: UploadAttachment, intent: "import" | "enrich") => {
    setUpload(next);
    const wasScrape = spec.sourceType && spec.sourceType !== "upload";
    const nextSpec = wasScrape
      ? withEnrichmentDefaults({ ...EMPTY_SPEC, sourceType: "upload", uploadIntent: intent }, undefined)
      : { ...spec, sourceType: "upload" as const, uploadIntent: intent };
    setSpec(nextSpec);
    if (wasScrape) {
      setCoverage([]);
      setInferred(new Set());
    }
    setInferred((prev) => { const out = new Set(prev); out.delete("sourceType"); return out; });
    if (selectedTemplate && templateSourceType(selectedTemplate) !== "upload") {
      setSelectedTemplate(null);
      lastTemplateId.current = null;
    }
    setConfirmed(false);
    noteAttachment(
      `You Attached: ${next.name} (${intent === "enrich" ? "Enrich" : "Import"})`,
      next.parseable && next.mapped
        ? `Got ${next.name} — ${next.rowCount.toLocaleString()} rows. ${
            intent === "enrich"
              ? "I'll fill the missing phones and emails, then re-scrub against DNC and litigator lists."
              : "Review the mapping and settings in the List Builder, then generate the list."
          }`
        : `Got ${next.name}. Map your columns in the List Builder and I'll clean, verify, and scrub it.`,
      nextSpec,
    );
    if (next.parseable && !next.mapped) setMapOpen(true);
    else if (next.parseable) toast.success(`${next.name} · ${next.rowCount.toLocaleString()} Rows Detected`);
  };

  /** Intent 3 — the file configures the scrape; the current source stays. */
  const applyUploadAsTargets = (next: UploadAttachment, kind: TargetKind) => {
    const values = targetValuesFrom(next);
    if (!values.length) {
      toast.error("No Values Found In That File.");
      return;
    }
    const nextSpec: JobSpec = { ...spec, scrapeTargets: values, scrapeTargetKind: kind };
    setSpec(nextSpec);
    setConfirmed(false);
    noteAttachment(
      `You Attached: ${next.name} (Scrape Targets)`,
      `Using ${values.length.toLocaleString()} ${TARGET_KIND_LABEL[kind].toLowerCase()} from ${next.name} as scrape targets — I'll run the selected source once per value. Your file stays a parameter list; it won't become leads.`,
      nextSpec,
    );
    toast.success(`${values.length.toLocaleString()} Scrape Targets Loaded`);
  };

  /** Intent 4 — persist an exclusion set for this and every future run. */
  const applyUploadAsSuppression = async (next: UploadAttachment) => {
    if (!workspaceId) return;
    const { phones, emails } = suppressionKeysFrom(next);
    if (!phones.length) {
      toast.error("No Phone Numbers Found To Suppress.");
      return;
    }
    const { error } = await supabase.from("suppression").upsert(
      phones.map((phone) => ({ workspace_id: workspaceId, phone, reason: `upload:${next.name}` })),
      { onConflict: "workspace_id,phone" },
    );
    if (error) {
      toast.error("Could Not Save The Suppression List.");
      return;
    }
    const nextSpec: JobSpec = { ...spec, suppressionFile: next.name };
    setSpec(nextSpec);
    noteAttachment(
      `You Attached: ${next.name} (Suppression List)`,
      `Added ${phones.length.toLocaleString()} numbers${emails.length ? ` (and skipped ${emails.length.toLocaleString()} email-only rows)` : ""} to your workspace suppression list. Nobody on that file will be contacted — on this run or any future one.`,
      nextSpec,
    );
    toast.success(`${phones.length.toLocaleString()} Numbers Suppressed Workspace-Wide`);
  };

  /**
   * Single entry point for every attach control. We read the file, infer what
   * it is, and let the user confirm before anything in the builder changes.
   */
  const requestAttach = async (file: File) => {
    if (!isSpreadsheet(file)) {
      toast.error("Attach A .csv Or .xlsx File.");
      return;
    }
    try {
      const next = await readAttachment(file);
      setPendingUpload(next);
      setPendingDetection(detectUploadIntent(next));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Read That File");
    }
  };

  const clearPending = () => { setPendingUpload(null); setPendingDetection(null); };

  const confirmIntent = (intent: UploadIntent) => {
    const next = pendingUpload;
    const kind = pendingDetection?.targetKind ?? "keywords";
    clearPending();
    if (!next) return;
    if (intent === "targets") applyUploadAsTargets(next, kind);
    else if (intent === "suppression") void applyUploadAsSuppression(next);
    else applyUploadAsLeads(next, intent);
  };

  const saveMapping = (map: ColumnMap) => {
    setUpload((u) => (u ? { ...u, map, mapped: true } : u));
    setMapOpen(false);
    setConfirmed(false);
  };

  const dictate = () => {
    const w = window as unknown as Record<string, any>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const said = e.results?.[0]?.[0]?.transcript ?? "";
      if (said) setInput((v) => (v ? `${v} ${said}` : said));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy, revealed]);

  // Reveal the reasoning trail one row at a time so assembly feels live.
  useEffect(() => {
    if (busy || traceSteps.length === 0) return;
    if (revealed >= traceSteps.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 260);
    return () => clearTimeout(t);
  }, [busy, revealed, traceSteps.length]);

  // Draft persistence (§22): restore on return, keep saving as the thread grows.
  useEffect(() => {
    if (!workspaceId || restored.current) return;
    restored.current = true;
    if (search.prompt?.trim() || search.source) return;
    const draft = loadDraft(workspaceId);
    if (!draft) return;
    if (!draft.thread.length) return;
    setThread(draft.thread);
    setSpec(draft.spec);
    setFirstPrompt(draft.firstPrompt);
    if (draft.convId) setConvId(draft.convId);
    if (draft.templateId) {
      const t = TEMPLATES.find((x) => x.id === draft.templateId);
      if (t) { setSelectedTemplate(t); lastTemplateId.current = t.id; }
    }
    setInferred(new Set((draft.inferred ?? []) as Array<keyof JobSpec>));
    setRevealed(buildTraceSteps(draft.spec).length);
  }, [workspaceId, search.prompt, search.source]);

  useEffect(() => {
    if (!workspaceId || !thread.length) return;
    saveDraft(workspaceId, {
      thread,
      spec,
      firstPrompt,
      convId,
      templateId: selectedTemplate?.id ?? null,
      inferred: Array.from(inferred),
    });
  }, [workspaceId, thread, spec, firstPrompt, convId, selectedTemplate, inferred]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!workspaceId || busy) return;
    // Uploads have their own required slot: a mapped file. Niche/location
    // questions don't apply, so the assistant asks for the file instead.
    if (spec.sourceType === "upload" && !uploadReady) {
      if (body) setThread((m) => [...m, { role: "user", content: body }]);
      setThread((m) => [
        ...m,
        {
          role: "assistant",
          content: upload
            ? "Map your columns in the List Builder on the right and I'll take it from there."
            : "Drop your file in the List Builder on the right, or attach it below.",
          spec,
        },
      ]);
      if (body && !firstPrompt) setFirstPrompt(body);
      setInput("");
      setRevealed(0);
      return;
    }
    if (spec.sourceType === "upload" && !body) return;
    // Template selected and nothing typed yet: the assistant opens the
    // conversation itself. Once the operator HAS typed something it always goes
    // to the server — a local shortcut here is how "hillsborough county" got
    // swallowed before it ever reached the Counties field.
    if (!body && selectedTemplate && templateSourceType(selectedTemplate) !== "upload") {
      const miss = missingSlots(body, spec);
      if (miss.geo || miss.subject) {
        const ask = miss.subject && miss.geo
          ? hasCategory(selectedTemplate, "records")
            ? "which record type should I pull, and in which county or state?"
            : "what should I look for, and where?"
          : miss.subject
            ? hasCategory(selectedTemplate, "records")
              ? "which record type should I pull?"
              : "what should I look for?"
            : "which county or state should I cover?";
        setThread((m) => [
          ...m,
          { role: "assistant", content: `You picked ${selectedTemplate.title} — ${ask}`, spec },
        ]);
        setInput("");
        setRevealed(0);
        return;
      }
    }
    if (!body) return;
    const history = thread
      .filter((m): m is ThreadItem & { role: "user" | "assistant" } => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    if (selectedTemplate) {
      history.push({
        role: "user",
        content: `Use the ${selectedTemplate.title} source template (${selectedTemplate.subtitle}).`,
      });
    }
    if (!firstPrompt) setFirstPrompt(body);
    setThread((m) => [...m, { role: "user", content: body }]);
    setInput("");
    setBusy(true);
    setConfirmed(false);
    setRevealed(0);
    try {
      const res = await chat({
        data: { workspaceId, message: body, history: history.slice(-12), spec, panelEdits },
      });
      setPanelEdits([]);
      setThread((m) => [...m, { role: "assistant", content: res.reply, spec: res.spec }]);
      setSpecStated(Boolean(res.specComplete));
      // Anything the model changed this turn counts as inferred, except fields the
      // template already determined (those are certain and need no badge).
      setInferred((prev) => {
        const next = new Set(prev);
        (["sourceType", "recordType", "niches", "state", "counties"] as Array<keyof JobSpec>).forEach((k) => {
          const changed = JSON.stringify(spec[k]) !== JSON.stringify(res.spec[k]);
          const filled = Array.isArray(res.spec[k]) ? (res.spec[k] as unknown[]).length > 0 : Boolean(res.spec[k]);
          if (changed && filled) next.add(k);
        });
        if (selectedTemplate) next.delete("sourceType");
        return next;
      });
      setSpec(res.spec);
      // The interpreter may match a named source ("Zillow listings") to a template.
      if (res.spec.templateId && res.spec.templateId !== selectedTemplate?.id) {
        const matched = TEMPLATES.find((t) => t.id === res.spec.templateId);
        if (matched) {
          setSelectedTemplate(matched);
          lastTemplateId.current = matched.id;
        }
      }
      setCoverage(res.coverage);
      setSuggested(res.suggestedTemplates);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The Assistant Could Not Answer");
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    clearStashedPrompt();
    if (workspaceId) clearDraft(workspaceId);
    lastTemplateId.current = null;
    setSelectedTemplate(null);
    setThread([]);
    setInput("");
    setSpec(EMPTY_SPEC);
    setFirstPrompt("");
    setCoverage([]);
    setSuggested([]);
    setConfirmed(false);
    setRevealed(0);
    setSpecStated(false);
    setPanelEdits([]);
    setInferred(new Set());
    setUpload(null);
    setConvId(`c${Date.now()}`);
    setPanelOpen(false);
  };

  /**
   * Panel-only entry (?source=, and the "set it up yourself" affordance): reset,
   * then apply just the source — the same reset-then-apply as a template pick.
   */
  const openPanelWithSource = (source: "business" | "records" | "upload", niche?: string) => {
    if (workspaceId) clearDraft(workspaceId);
    setConvId(`c${Date.now()}`);
    setThread([]);
    setSelectedTemplate(null);
    lastTemplateId.current = null;
    setFirstPrompt("");
    setCoverage([]);
    setSuggested([]);
    setConfirmed(false);
    setRevealed(0);
    setSpecStated(false);
    setPanelEdits([]);
    setInferred(new Set());
    setUpload(null);
    setSpec({ ...EMPTY_SPEC, sourceType: source, niches: niche ? [niche] : [] });
    setPanelOpen(true);
  };

  // Two-way sync: a manual panel edit is announced in the thread so the next
  // assistant turn (and the operator) both know it happened.
  const editSpec = (patch: Partial<JobSpec>) => {
    // Patch, never rebuild: whatever the panel hands back is merged onto the
    // spec on screen so untouched fields survive and the CTA, the estimate and
    // the server validator all read one object.
    const merged: JobSpec = patchSpec(spec, patch);
    const changed = diffSpec(spec, merged);
    setSpec((prev) => patchSpec(prev, patch));
    setConfirmed(false);
    if (changed.length) {
      // A hand edit un-confirms the spoken spec: the assistant must read the new
      // version back before the List Assembled card can return.
      setSpecStated(false);
      setPanelEdits((prev) => Array.from(new Set([...prev, ...changed])));
    }
    if (changed.length) {
      // A hand-edited value is the operator's choice, not an inference.
      setInferred((prev) => {
        const out = new Set(prev);
        (Object.keys(FIELD_LABELS) as Array<keyof JobSpec>).forEach((k) => {
          if (JSON.stringify(spec[k]) !== JSON.stringify(merged[k])) out.delete(k);
        });
        return out;
      });
    }
    if (changed.length && thread.length) {
      const content = `You Edited: ${changed.join(" · ")}`;
      setThread((m) => {
        const last = m[m.length - 1];
        // Same field edited again: update the existing chip in place instead of
        // stacking duplicate consecutive chips.
        if (last && last.role === "system" && last.content.startsWith("You Edited: ")) {
          const prevFields = last.content.slice("You Edited: ".length).split(" · ");
          const mergedFields = Array.from(new Set([...prevFields, ...changed]));
          return [...m.slice(0, -1), { role: "system", content: `You Edited: ${mergedFields.join(" · ")}` }];
        }
        return [...m, { role: "system", content }];
      });
      // A widened county list multiplies the credit cost, so the assistant says
      // it out loud immediately instead of leaving it to a silent chip.
      const wasNarrow = spec.counties.length > 0;
      const nowStatewide = merged.counties.length === 0 && specStates(merged).length > 0;
      if (wasNarrow && nowStatewide) {
        const dropped = spec.counties.join(", ");
        const states = specStates(merged);
        const total = states.reduce((n, s) => n + countiesForState(s).length, 0);
        setThread((m) => [
          ...m,
          {
            role: "assistant",
            content: `I see you switched to all of ${states.join(", ")} — that's ${total} counties, which multiplies your credit cost by roughly ${total}×. Want me to keep it to ${dropped}?`,
            spec: merged,
          },
        ]);
      }
    }
  };

  // Deep-link: the marketing handoff carries the typed text in ?prompt= and the
  // selected template in ?template=, with a short-lived stash as the fallback.
  useEffect(() => {
    if (appliedSource.current || !workspaceId) return;
    const source = search.source;
    if (source !== "business" && source !== "records" && source !== "upload") return;
    appliedSource.current = true;
    sentPrompt.current = true;
    openPanelWithSource(source, search.niche?.trim() || undefined);
    navigate({ to: "/app/assistant", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, search.source, search.niche]);

  // Deep-link: the marketing handoff carries the typed text in ?prompt= and the
  // selected template in ?template=, with a short-lived stash as the fallback.
  useEffect(() => {
    if (sentPrompt.current || !workspaceId) return;
    const fromUrl = search.prompt?.trim();
    const urlTemplate = search.template;
    const stashed = fromUrl || urlTemplate ? null : takeStashedHandoff();
    const templateId = urlTemplate ?? stashed?.templateId ?? null;
    const initial = (fromUrl || stashed?.text || "").trim();
    if (!templateId && !initial) return;
    sentPrompt.current = true;
    if (fromUrl || urlTemplate) navigate({ to: "/app/assistant", search: {}, replace: true });

    const picked = templateId ? TEMPLATES.find((t) => t.id === templateId) : undefined;
    if (picked) {
      selectTemplate(picked);
      // fill=1 (in-app template pick) prefills the composer instead of sending.
      if (initial && search.fill) {
        setInput(initial);
        return;
      }
      // Send once inside the template context — even with no typed text, so the
      // assistant opens with its own slot-filling question.
      pendingHandoff.current = { templateId: picked.id, text: initial };
      return;
    }
    if (!initial) return;
    if (search.fill) {
      setInput(initial);
      return;
    }
    void send(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, search.prompt, search.template]);

  // The template's spec reset must land before the handoff text is sent.
  useEffect(() => {
    const pending = pendingHandoff.current;
    if (!pending || !selectedTemplate || selectedTemplate.id !== pending.templateId) return;
    pendingHandoff.current = null;
    void send(pending.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  const uncovered = coverage.filter((c) => c.coverage === "requested" || c.coverage === "unknown");

  // Confirmed waitlist state must survive a reload, so it comes from the table.
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    fetchAdapterRequests({ data: { workspaceId } })
      .then((res) => {
        if (!alive) return;
        setRequestedAdapters(new Set(res.templateIds));
        setNotifyEmail(res.email);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const adapterRequested = Boolean(selectedTemplate && requestedAdapters.has(selectedTemplate.id));

  const request = async (county: string) => {
    if (!workspaceId) return;
    try {
      await logRequest({ data: { workspaceId, county, recordType: spec.recordType, type: "county" } });
      toast.success("County Request Logged");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Log Request");
    }
  };

  /** Record types we can't fulfill yet land in the same backlog as county requests. */
  const requestRecordType = async (requested: string) => {
    if (!workspaceId) return;
    setSourceRequest({
      type: "record_type",
      templateId: null,
      label: requested,
      geo: specStates(spec).join(", "),
    });
  };

  /** Waitlist click for a source whose adapter isn't wired yet — opens the intake. */
  const requestTemplateAdapter = async () => {
    if (!workspaceId || !selectedTemplate) return;
    if (requestedAdapters.has(selectedTemplate.id)) return;
    setRequestError(null);
    setSourceRequest({
      type: "template_adapter",
      templateId: selectedTemplate.id,
      label: selectedTemplate.title,
      geo: specStates(spec).join(", "),
    });
  };

  const reviewAndRun = async () => {
    if (!workspaceId) return;
    if (!team.can("build_list")) {
      toast.error(denialMessage(team.role, "build_list"));
      return;
    }
    if (!adapterLive) {
      void requestTemplateAdapter();
      return;
    }
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    if (spec.sourceType === "upload") {
      if (!upload) {
        toast.error("Attach A File First.");
        return;
      }
      setRunning(true);
      try {
        // Same params shape the Upload page queues, so the pipeline is identical.
        const { id, duplicate } = await queueUploadJob({ data: {
          workspaceId,
          channel:
            spec.channel ??
            inferChannel({
              templateId: spec.templateId,
              sourceType: spec.sourceType,
              recordType: spec.recordType,
              country: spec.country,
            }),
          params: {
            file_name: upload.name,
            file_size: upload.size,
            mapping: upload.map,
            skip_trace: spec.skipTrace,
            rows: attachmentRows(upload),
          },
        } });
        clearDraft(workspaceId);
        navigate({ to: "/app/lists/$listId", params: { listId: id } });
        if (duplicate) {
          toast.info("This File Was Already Queued — Opening That Run.");
          return;
        }
        toast.success("List Queued. Running Pipeline…");
        runJobFn({ data: { jobId: id } }).catch((e) =>
          toast.error(e instanceof Error ? e.message : "Pipeline Failed"),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could Not Queue List");
      } finally {
        setRunning(false);
      }
      return;
    }
    setRunning(true);
    try {
      const transcript = thread
        .filter((m): m is ThreadItem & { role: "user" | "assistant" } => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const { jobId } = await createJob({ data: { workspaceId, spec, transcript: transcript.slice(-40) } });
      clearDraft(workspaceId);
      // A template-originated run counts as usage, so it stays near the front.
      if (lastTemplateId.current) setRecents(touchRecentTemplate(workspaceId, lastTemplateId.current));
      toast.success("List Queued. Running Pipeline…");
      navigate({ to: "/app/lists/$listId", params: { listId: jobId } });
      runJobFn({ data: { jobId } }).catch((e) =>
        toast.error(e instanceof Error ? e.message : "Pipeline Failed"),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Queue List");
    } finally {
      setRunning(false);
    }
  };

  const templateChips = (suggested.length
    ? TEMPLATES.filter((t) => suggested.some((s) => s.toLowerCase() === t.id.toLowerCase() || s.toLowerCase() === t.title.toLowerCase()))
    : []
  ).slice(0, 4);

  // No spec yet → show an example. Spec assembled or assembling → refine copy.
  // Run queued → the conversation moves on to the next list.
  const composerPlaceholder = running
    ? RUNNING_PLACEHOLDER
    : spec.sourceType || busy
      ? REFINE_PLACEHOLDER
      : selectedTemplate?.placeholderHint ?? GENERIC_PLACEHOLDER;

  const geoResolved = Boolean(specStates(spec).length || spec.counties.length || spec.sourceType === "upload");

  // Coverage verdict from the same server function the queue gate uses, so the
  // panel can never price geography the runner would refuse.
  const coverageInput = {
    sourceType: spec.sourceType,
    recordType: spec.recordType ?? null,
    counties: spec.counties,
    states: specStates(spec),
  };
  const jobCoverageQ = useQuery({
    queryKey: ["job-coverage", coverageInput],
    queryFn: () => getJobCoverage({ data: coverageInput }),
    enabled: Boolean(spec.sourceType),
    staleTime: 60_000,
  });
  const verdict = jobCoverageQ.data ?? null;
  const coverageBlocked = Boolean(
    verdict?.gated && (verdict.status === "none" || verdict.status === "scope_too_broad"),
  );
  const priceable = geoResolved && !coverageBlocked;

  const coveragePartial = verdict?.status === "partial";
  /** Public-record estimates include only counties the coverage gate will run. */
  const pricedSpec = useMemo(
    () =>
      verdict?.gated && verdict.coveredCounties.length > 0
        ? { ...spec, counties: verdict.coveredCounties }
        : spec,
    [spec, verdict],
  );
  const estimate = useMemo(() => estimateSpec(pricedSpec), [pricedSpec]);
  const traceCoverage = verdict?.gated
    ? {
        status: verdict.status,
        covered: verdict.coveredCounties.length,
        requested: verdict.requestedCounties.length,
      }
    : null;

  /** Last row cap this workspace used, so it isn't re-entered every run. */
  useEffect(() => {
    if (!workspaceId) return;
    const saved = loadMaxRows(workspaceId);
    if (saved) setSpec((s) => (s.maxResults === saved ? s : { ...s, maxResults: saved }));
  }, [workspaceId]);

  const setMaxRows = (value: number | null) => {
    const next = value && value > 0 ? Math.min(50000, Math.round(value)) : null;
    setSpec((s) => ({ ...s, maxResults: next }));
    if (workspaceId && next) saveMaxRows(workspaceId, next);
  };

  const { balances: creditBalances } = useCreditBalances();
  const { plan } = usePlanContext();
  const activeTemplate = spec.templateId ? getTemplate(spec.templateId) : undefined;

  const countyCount = Math.max(1, spec.counties.length || 1);
  const pricedCountyCount =
    verdict?.gated && verdict.coveredCounties.length > 0 ? verdict.coveredCounties.length : countyCount;
  const tradeCount = spec.sourceType === "business" ? Math.max(1, spec.niches.length) : 1;
  const searchCount = pricedCountyCount * tradeCount;

  const isScan = spec.sourceType === "street_scan";
  /**
   * Street Scan quotes from its own buy-box cascade, but it renders in the
   * SAME estimate slot as every other source — one estimator, one approve.
   */
  const scanEstimate = useMemo(
    () =>
      isScan
        ? estimateScan({
            counties: spec.counties,
            states: specStates(spec),
            buyBox: spec.buyBox,
            matchThreshold: spec.matchThreshold,
            imagesPer: spec.imagesPer,
            maxResults: spec.maxResults,
          })
        : null,
    [isScan, spec.counties, spec.buyBox, spec.matchThreshold, spec.imagesPer, spec.maxResults, spec.state, spec.states],
  );

  const overScan = Boolean(scanEstimate && scanEstimate.scanCredits > creditBalances.scrape);
  const overScanSkip = Boolean(scanEstimate && scanEstimate.skipTraceCredits > creditBalances.skip_trace);

  const scanControls = isScan && (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3">
      <div>
        <div className="text-xs font-medium text-foreground">Match Threshold</div>
        <Input
          type="number"
          min={50}
          max={100}
          inputMode="numeric"
          className="mt-2 h-8 w-24 text-sm"
          value={spec.matchThreshold ?? DEFAULT_MATCH_THRESHOLD}
          onChange={(e) =>
            setSpec((prev) => ({
              ...prev,
              matchThreshold: Math.max(50, Math.min(100, Number(e.target.value) || DEFAULT_MATCH_THRESHOLD)),
            }))
          }
          aria-label="Match threshold"
        />
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Minimum condition score a house needs to make your list. Higher keeps fewer, worse-looking houses.
        </p>
      </div>
      <div>
        <div className="text-xs font-medium text-foreground">Images Per Property</div>
        <div className="mt-2 flex gap-1">
          {([1, 3] as const).map((count) => (
            <Button
              key={count}
              type="button"
              size="sm"
              variant={spec.imagesPer === count ? "default" : "outline"}
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={() => setSpec((prev) => ({ ...prev, imagesPer: count }))}
            >
              {count === 1 ? "1 Angle" : "3 Angles"}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Three angles score more accurately and cost more. One angle is enough for a first pass.
        </p>
      </div>
    </div>
  );

  const scanEstimateBlock = scanEstimate && adapterLive && priceable && (
    <div className="space-y-2">
      <PipelineFunnel
        size="sm"
        variant="scan"
        stages={{
          found: scanEstimate.parcelsInArea,
          deduped: scanEstimate.afterOwnership,
          verified: scanEstimate.afterFinancial,
          scrubbed: scanEstimate.scanned,
          clean: scanEstimate.matched,
        }}
      />
      <div className="space-y-1.5 text-center text-xs">
        <div className="text-muted-foreground">
          ≈ {scanEstimate.matched.toLocaleString()} Matched Properties ·{" "}
          <span className={overScan ? "font-semibold text-primary" : undefined}>
            {scanEstimate.scanCredits.toLocaleString()} of {creditBalances.scrape.toLocaleString()} Lead Credits
          </span>{" "}
          ·{" "}
          <span className={overScanSkip ? "font-semibold text-primary" : undefined}>
            {scanEstimate.skipTraceCredits.toLocaleString()} of {creditBalances.skip_trace.toLocaleString()} Skip-Trace Credits
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Imagery is only bought for the {scanEstimate.scanned.toLocaleString()} parcels left after your buy box.
        </div>
        {(overScan || overScanSkip) && (
          <div className="text-primary">
            This scan costs more credits than you have left.{" "}
            <Link to="/app/billing" className="font-semibold underline">
              Add Credits
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  const overLead = Boolean(estimate && estimate.scrapeCredits > creditBalances.scrape);
  const overSkip = Boolean(estimate && estimate.skipTraceCredits > creditBalances.skip_trace);
  const overBudget = overLead || overSkip;

  /**
   * Terminal CTA states. The loading label is allowed ONLY while something is
   * genuinely in flight (model turn, trace reveal, coverage lookup) — every
   * other combination resolves to a label the operator can act on.
   */
  const previewInFlight =
    busy || jobCoverageQ.isLoading || (traceSteps.length > 0 && revealed < traceSteps.length);
  // Readiness is the blocker list, NOT whether the assistant has restated the
  // spec: a hand edit un-confirms the spoken recap, and gating the CTA on that
  // is what stranded a complete spec behind a disabled button.
  const runnable = traceSteps.length > 0 && blockers.length === 0;
  // `?debug=spec` prints the live spec plus what the completeness check reads.
  const [specDebug, setSpecDebug] = useState(false);
  useEffect(() => {
    setSpecDebug(new URLSearchParams(window.location.search).get("debug") === "spec");
  }, []);
  const creditsShort = overBudget || overScan || overScanSkip;
  const coveredCount = verdict?.coveredCounties.length ?? 0;
  const cta: { label: string; disabled: boolean; to?: string } = running
    ? { label: "Queueing…", disabled: true }
    : coverageBlocked
      ? { label: "Not Available — Request Coverage", disabled: true }
      : previewInFlight
        ? { label: "Building Preview…", disabled: true }
        : !runnable
          ? { label: blockers[0]!, disabled: true }
          : creditsShort
            ? { label: "Add Credits to Continue", disabled: false, to: "/app/billing" }
            : coveragePartial
              ? {
                  label: `Run ${coveredCount} Covered ${coveredCount === 1 ? "County" : "Counties"}`,
                  disabled: false,
                }
              : { label: confirmed ? "Generate List" : "Looks Good", disabled: false };

  const rowCapControl = adapterLive && spec.sourceType && spec.sourceType !== "upload" && (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs font-medium text-foreground">Max Leads</div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={50000}
          inputMode="numeric"
          className="h-8 w-24 text-sm"
          value={spec.maxResults ?? ""}
          onChange={(e) => setMaxRows(e.target.value === "" ? null : Number(e.target.value))}
          aria-label="Max leads"
        />
        <div className="flex flex-wrap gap-1">
          {MAX_ROWS_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={spec.maxResults === preset ? "default" : "outline"}
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={() => setMaxRows(preset)}
            >
              {preset.toLocaleString()}
            </Button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Caps how many leads this job can pull. Because we run one search per trade per county, your
        total is this number × trades × counties.
        {spec.maxResults
          ? ` Right now: ${tradeCount.toLocaleString()} ${tradeCount === 1 ? "trade" : "trades"} × ${pricedCountyCount.toLocaleString()} covered ${pricedCountyCount === 1 ? "county" : "counties"} × ${spec.maxResults.toLocaleString()} = up to ${(searchCount * spec.maxResults).toLocaleString()} leads.`
          : " Leave it empty to use the source default of 500."}
      </p>
    </div>
  );

  const runFooter = (
    <div className="space-y-3 border-t border-border bg-background pt-4">
      {/* Coverage refusal comes before any price. No estimate, no Run. */}
      {coverageBlocked && verdict?.message && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-xs">
          <div className="font-medium text-foreground">
            {verdict.status === "scope_too_broad" ? "Narrow This List" : "Not Covered Yet"}
          </div>
          <div className="mt-1 text-muted-foreground">{verdict.message}</div>
          {verdict.uncoveredCounties.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {verdict.uncoveredCounties.map((c) => (
                <Button key={c} size="sm" variant="outline" className="rounded-full" onClick={() => request(c)}>
                  Request {c}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Partial coverage: we price only the counties we can actually reach. */}
      {verdict?.status === "partial" && verdict.message && (
        <div className="rounded-xl border border-border p-3 text-xs">
          <div className="font-medium text-foreground">Partial Coverage</div>
          <div className="mt-1 text-muted-foreground">
            {verdict.message} You're only charged for {verdict.coveredCounties.join(", ")}.
          </div>
        </div>
      )}

      {/* The coverage verdict above is the only place a Request button renders —
          one button per uncovered county, not one per UI layer that noticed. */}
      {!verdict?.gated && uncovered.length > 0 && (
        <div className="rounded-xl border border-border p-3 text-xs">
          <div className="font-medium text-foreground">Not Covered Yet</div>
          <div className="mt-1 text-muted-foreground">
            Log A Request And We'll Add It To The Backlog.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {uncovered.map((c) => (
              <Button key={c.county} size="sm" variant="outline" className="rounded-full" onClick={() => request(c.county)}>
                Request {c.county}
              </Button>
            ))}
          </div>
        </div>
      )}

      {rowCapControl}

      {scanControls}

      {scanEstimateBlock}

      {estimate && adapterLive && spec.sourceType && priceable && (
        <div className="space-y-1.5 text-center text-xs">
          <div className="text-muted-foreground">
            ≈ {estimate.rows.toLocaleString()} Leads ·{" "}
            <span className={overLead ? "font-semibold text-primary" : undefined}>
              {estimate.scrapeCredits.toLocaleString()} of {creditBalances.scrape.toLocaleString()} Lead Credits
            </span>{" "}
            ·{" "}
            <span className={overSkip ? "font-semibold text-primary" : undefined}>
              {estimate.skipTraceCredits.toLocaleString()} of {creditBalances.skip_trace.toLocaleString()} Skip-Trace Credits
            </span>
          </div>
          {overBudget && (
            <div className="text-primary">
              This job costs more {overLead && overSkip ? "credits" : overLead ? "lead credits" : "skip-trace credits"} than
              you have left.{" "}
              <Link to="/app/billing" className="font-semibold underline">
                Add Credits
              </Link>
            </div>
          )}
        </div>
      )}

      {/* The Free plan boundary, shown only when this exact run needs a card. */}
      {spec.sourceType && (
        <FreeTierNotice
          plan={plan}
          action={{
            templateId: spec.templateId,
            creditCostPerLead: activeTemplate ? creditCostPerLead(activeTemplate) : 0,
            skipTrace: spec.skipTrace,
          }}
        />
      )}

      {adapterLive ? (
        <>
          {cta.to ? (
            <Button asChild className="w-full rounded-full">
              <Link to={cta.to}>
                <CreditCard className="mr-1 h-4 w-4" /> {cta.label}
              </Link>
            </Button>
          ) : (
            <Button
              className="w-full rounded-full"
              disabled={cta.disabled || !spec.sourceType}
              onClick={reviewAndRun}
            >
              {confirmed ? <Play className="mr-1 h-4 w-4" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} {cta.label}
            </Button>
          )}
          <div className="text-center text-[11px] text-muted-foreground pb-4">
            The Assistant Assembles. You Run. Nothing Sends Without You.
          </div>
          {specDebug && (
            <pre className="mb-4 max-h-72 overflow-auto rounded-lg border border-border bg-muted p-2 text-[10px] leading-tight text-muted-foreground">
{JSON.stringify({ blockers, openSlots: missing, specStated, revealed, traceSteps: traceSteps.length, spec }, null, 1)}
            </pre>
          )}
        </>
      ) : (
        <div className="space-y-2 px-1">
          {adapterRequested ? (
            <>
              <Button
                disabled
                variant="outline"
                className="h-9 w-full rounded-full border-2 border-emerald-500 bg-emerald-500/10 text-sm font-semibold text-emerald-600 disabled:opacity-100 dark:text-emerald-400"
              >
                <Check className="mr-1 h-4 w-4" /> You're On The List
              </Button>
              <div className="text-center text-xs text-foreground/70">
                We'll Email You As Soon As It's Available.
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="h-9 w-full rounded-full border-2 border-primary bg-primary/5 text-sm font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => void requestTemplateAdapter()}
              >
                <BellPlus className="mr-1 h-4 w-4" /> Launching Soon — Request This Source
              </Button>
              {requestError && (
                <div className="text-center text-xs text-destructive">{requestError}</div>
              )}
              <div className="text-center text-xs text-foreground/70">
                Launching Soon! Join The Waitlist To Be Notified.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  const specPanel = (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="relative min-h-0 flex-1">
        <div
          ref={specScroll.ref}
          tabIndex={0}
          onScroll={() => setNudgeVisible(false)}
          className={`h-full min-h-0 lg:overflow-y-auto ${
            specScroll.overflowing ? "list-builder-scroll lg:pr-1" : ""
          } ${
            !specScroll.overflowing
              ? ""
              : !specScroll.atTop && !specScroll.atBottom
                ? "scroll-mask-both"
                : !specScroll.atBottom
                  ? "scroll-mask-bottom"
                  : !specScroll.atTop
                    ? "scroll-mask-top"
                    : ""
          }`}
        >
          <JobSpecCard
            spec={spec}
            onChange={editSpec}
            coverage={coverage}
            inferred={inferred}
            upload={upload}
            template={selectedTemplate}
            onChangeTemplate={() => setAllOpen(true)}
            onPickFile={(f) => void requestAttach(f)}
            onRemoveUpload={() => { setUpload(null); setConfirmed(false); }}
            onClearTargets={() => {
              setSpec((s) => ({ ...s, scrapeTargets: [], scrapeTargetKind: null }));
              setConfirmed(false);
            }}
            onEditMapping={() => setMapOpen(true)}
            onRequestRecordType={requestRecordType}
          />
        </div>
        {specScroll.overflowing && !specScroll.atBottom && nudgeVisible && (
          <div className="scroll-nudge pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
              <ChevronDown className="h-3.5 w-3.5" /> Scroll for more
            </span>
          </div>
        )}
      </div>
      <div className="shrink-0">{runFooter}</div>
    </div>
  );

  const composerBox = (
    <div className="rounded-2xl border border-border bg-card p-4 pb-3 shadow-sm focus-within:border-primary">
      <Textarea
        ref={composer}
        rows={started ? 2 : 4}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send(input);
          }
        }}
        placeholder={composerPlaceholder}
        className="resize-none rounded-none border-0 bg-transparent px-2 py-0 text-base shadow-none focus-visible:ring-0"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-foreground hover:text-primary">
              <Paperclip className="h-3.5 w-3.5" /> Upload List
              <input
                type="file"
                className="hidden"
                accept=".csv,.xlsx"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void requestAttach(f); }}
              />
            </label>
          </TooltipTrigger>
          <TooltipContent>Upload A CSV Or Excel List To Clean, Scrub, And Enrich</TooltipContent>
        </Tooltip>
        <Button
          className="rounded-full px-5"
          disabled={busy || (!input.trim() && !selectedTemplate && !upload)}
          onClick={() => send(input)}
        >
          <Sparkles className="mr-1 h-4 w-4" /> {started ? "Send" : "Generate List"}
        </Button>
      </div>
    </div>
  );

  // Recents first (most recent first), padded with the default order.
  const gridTemplates = useMemo(() => {
    const byId = new Map(TEMPLATES.map((t) => [t.id, t] as const));
    const ordered: Template[] = [];
    const seen = new Set<string>();
    for (const r of recents) {
      const t = byId.get(r.id);
      if (t && !seen.has(t.id)) { ordered.push(t); seen.add(t.id); }
    }
    for (const id of DEFAULT_GRID_IDS) {
      if (ordered.length >= GRID_SLOTS) break;
      const t = byId.get(id);
      if (t && !seen.has(t.id)) { ordered.push(t); seen.add(t.id); }
    }
    return ordered.slice(0, GRID_SLOTS);
  }, [recents]);

  // Rotation rests when a template supplies its own hint or the user is typing.
  const example = useRotatingExample(!selectedTemplate && !input.trim());

  const heroState = (
    <div className="w-full space-y-8 py-2">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">AI Lead Assistant</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe who you want to reach, upload a list to clean, or build it yourself in the List Builder — nothing runs until you approve.
        </p>
      </div>

      <div className="relative rounded-2xl border border-primary bg-card p-5 shadow-sm">
        {/* Visual placeholder: icon + label always render as a single aligned row */}
        {!input.trim() && (
          <div className="pointer-events-none absolute inset-x-5 top-5 flex items-center gap-2 pl-0.5 text-base text-muted-foreground">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <span
              className={`truncate transition-opacity duration-300 ${example.visible ? "opacity-100" : "opacity-0"}`}
            >
              {selectedTemplate?.placeholderHint ?? example.text}
            </span>
          </div>
        )}
        <Textarea
          ref={composer}
          rows={6}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          aria-label="Tell Me Who You Want To Reach"
          style={input.trim() ? undefined : { textIndent: "1.375rem" }}
          className="min-h-[150px] resize-none rounded-none border-0 bg-transparent px-2 py-0 text-base shadow-none focus-visible:ring-0"
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="inline-flex cursor-pointer items-center rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                  <Paperclip className="mr-1.5 h-4 w-4" /> Upload List
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void requestAttach(f); }}
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent>Upload A CSV Or Excel List To Clean, Scrub, And Enrich</TooltipContent>
            </Tooltip>
            {/* Panel-only path: no chat needed, straight into the List Builder. */}
            <button
              type="button"
              onClick={() => openPanelWithSource("business")}
              className="inline-flex cursor-pointer items-center rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Build It Yourself
            </button>
          </div>
          <div className="flex items-center gap-2">
            {micSupported && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={listening ? "Recording" : "Dictate"}
                onClick={dictate}
                className={`rounded-full ${listening ? "border-primary text-primary mic-recording" : ""}`}
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
            <Button
              className="rounded-full px-5"
              disabled={busy || (!input.trim() && !selectedTemplate)}
              onClick={() => send(input)}
            >
              Build List <Send className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-foreground">
            {recents.length ? "Your Recent Templates" : "Popular Templates"}
          </h2>
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="text-sm font-medium text-primary hover:underline"
          >
            View All →
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gridTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              variant="insert"
              compact
              selected={selectedTemplate?.id === t.id}
              comingSoon={isComingSoon(t)}
              onSelect={selectTemplate}
            />
          ))}
        </div>
      </div>

    </div>
  );

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-[90%]">
        {/* Per-workspace first run: building is never gated, but the send-side
            prerequisites (10DLC, number, agent) stay visible until they're done. */}
        <FirstRunSetup workspaceId={workspaceId ?? null} />

        {started && (
          <div className="shrink-0">
            <PageHeader
              title="AI Lead Assistant"
              description="Describe The Leads You Want — Or Build It Yourself In The List Builder. Nothing Runs Until You Approve."
              descriptionClassName="whitespace-nowrap !max-w-none"
              actions={
                <Button variant="outline" className="rounded-full" onClick={startOver}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Start Over
                </Button>
              }
            />
          </div>
        )}

        {!started && heroState}

        {started && (
          <div className="assistant-shell grid min-h-0 items-stretch gap-6 lg:grid-cols-[1fr_400px]">
            {/* Chat column: thread scrolls, composer stays pinned to the bottom. */}
            <Card className="flex min-h-0 flex-col">
              <CardContent className="flex min-h-0 flex-1 flex-col p-4 md:p-5">
                <div ref={scroller} className="thin-scroll min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                  {!hasChat && (
                    // Panel-only mode: the assembly checklist still leads, with no chat turn.
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        LeadTrace
                      </div>
                      <div className="mt-1.5 text-sm text-foreground">
                        Build it in the List Builder on the right, or type below and I'll fill it in for you.
                      </div>
                      <div className="mt-3">
                        <AssistantTrace steps={traceSteps} revealed={revealed} thinking={busy} open={missing} coverage={traceCoverage} />
                      </div>
                    </div>
                  )}
                  {thread.map((m, i) => (
                      <div key={i}>
                        {m.role === "system" ? (
                          <div className="flex justify-center">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
                              <SlidersHorizontal className="h-3 w-3" /> {m.content}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {m.role === "user" ? "You" : "LeadTrace"}
                            </div>
                            <div
                              className={`mt-1.5 whitespace-pre-wrap text-sm ${
                                m.role === "user"
                                  ? "inline-block rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {m.content}
                            </div>
                            {/* Assembly status lives inline, in chronological order. */}
                            {m.role === "assistant" && (
                              <div className="mt-3">
                                {i === lastAssistantIndex ? (
                                  <AssistantTrace steps={traceSteps} revealed={revealed} thinking={busy} open={missing} coverage={traceCoverage} />
                                ) : (
                                  <AssistantTrace
                                    steps={buildTraceSteps(m.spec ?? EMPTY_SPEC)}
                                    revealed={buildTraceSteps(m.spec ?? EMPTY_SPEC).length}
                                    thinking={false}
                                    open={openSlots(m.spec ?? EMPTY_SPEC, uploadReady)}
                                  />
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" /> Thinking…
                    </div>
                  )}
                </div>

                {templateChips.length > 0 && (
                  <div className="mt-4 flex shrink-0 flex-wrap gap-2">
                    {templateChips.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => send(t.prompt)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary"
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 shrink-0">{composerBox}</div>
                <div className="mt-2 shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CornerDownLeft className="h-3 w-3" /> Enter To Send · Shift + Enter For A New Line
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] uppercase">Beta</Badge>
                    AI May Make Mistakes. You Review Everything Before Anything Runs.
                  </span>
                </div>

                {started && (
                  <div className="mt-4 shrink-0 lg:hidden">
                    <Collapsible>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-sm">
                        <span className="text-foreground">{describeSpec(spec)}</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4">{specPanel}</CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* One consolidated List Builder rail, Generate pinned at its bottom. */}
            <div className="spec-slide-in hidden min-h-0 lg:block">{specPanel}</div>
          </div>
        )}
      </div>

      {upload?.parseable && (
        <ColumnMapperDialog
          open={mapOpen}
          onOpenChange={setMapOpen}
          fileName={upload.name}
          headers={upload.headers}
          value={upload.map}
          onConfirm={saveMapping}
        />
      )}

      {/* One source browser, mounted once: hero grid, panel row, and View All all use it. */}
      <TemplatePickerDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        selectedId={selectedTemplate?.id ?? null}
        onSelect={selectTemplate}
      />

      {/* Every attached file passes through the intent chooser first. */}
      <UploadIntentDialog
        open={!!pendingUpload}
        fileName={pendingUpload?.name ?? ""}
        detection={pendingDetection}
        allowSuppression
        onCancel={clearPending}
        onConfirm={confirmIntent}
      />

      {/* Sources we can't run yet go through a scoping intake, not a bare waitlist click. */}
      <SourceRequestDialog
        open={Boolean(sourceRequest)}
        onOpenChange={(o) => { if (!o) setSourceRequest(null); }}
        workspaceId={workspaceId ?? null}
        type={sourceRequest?.type ?? "template_adapter"}
        templateId={sourceRequest?.templateId ?? null}
        presetLabel={sourceRequest?.label ?? ""}
        presetGeo={sourceRequest?.geo ?? ""}
        onQueued={({ email }) => {
          const id = sourceRequest?.templateId;
          if (id) setRequestedAdapters((prev) => new Set(prev).add(id));
          if (email) setNotifyEmail(email);
        }}
      />
    </div>
  );
}
