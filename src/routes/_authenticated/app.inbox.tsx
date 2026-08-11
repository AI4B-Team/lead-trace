import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Archive,
  Ban,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  PhoneOff,
  Plus,
  Sparkles,
  Tag as TagIcon,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { useTeamContext } from "@/hooks/use-team-context";
import {
  listThreads,
  getThread,
  markThreadRead,
  sendReply,
  summarizeThread,
  suggestThreadReplies,
  blacklistThread,
  starThread,
  archiveThread,
  setThreadStatus,
} from "@/lib/inbox.functions";
import {
  AUTO_ARCHIVE_REASONS,
  THREAD_STATUSES,
  threadStatusLabel,
  type ThreadStatus,
} from "@/lib/thread-states.shared";
import { listQuickReplies, createQuickReply, listTags } from "@/lib/tags.functions";
import { LeadTagBar } from "@/components/app/lead-tag-picker";
import { VoiceMessageItem } from "@/components/app/voice-message-item";
import { listNumbers } from "@/lib/numbers.functions";
import { readSummary, writeSummary } from "@/lib/summary-cache";
import {
  AiActivityPill,
  AiSummary,
  ConversationRow,
  LeadProfilePanel,
  SuggestedReplies,
  buildTimeline,
  type ThreadRow,
} from "@/components/app/conversation-panels";
import { ContextStrip } from "@/components/app/conversation/context-strip";
import {
  ConversationThread,
  DateSeparator,
} from "@/components/app/conversation/conversation-thread";
import { MessageBubble } from "@/components/app/conversation/message-bubble";
import { MessageComposer } from "@/components/app/conversation/message-composer";
import { SLASH_COMMANDS, classifyIntent, dayLabel } from "@/lib/conversation-intel";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  validateSearch: (search: Record<string, unknown>): { filter?: string; thread?: string } => ({
    filter: typeof search.filter === "string" ? (search.filter as string) : undefined,
    thread: typeof search.thread === "string" ? (search.thread as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Conversations — LeadTrace" },
      {
        name: "description",
        content:
          "The AI sales command center: summaries, suggested replies, and full lead context on every SMS conversation.",
      },
    ],
  }),
  component: ConversationsPage,
});

type Filter =
  | "all"
  | "needs_reply"
  | "interested"
  | "appointments"
  | "ai"
  | "unread"
  | "optouts"
  | "starred"
  | "archived";

/**
 * Tab order puts the broadest view first, then narrows to action-oriented
 * buckets: All · Unread · Needs Reply · Starred · Archived.
 */
const PRIMARY_FILTERS: Array<{ key: Filter; label: string; short: string }> = [
  { key: "all", label: "All", short: "All" },
  { key: "unread", label: "Unread", short: "Unread" },
  { key: "needs_reply", label: "Needs Reply", short: "Replies" },
  { key: "starred", label: "Starred", short: "Starred" },
  { key: "archived", label: "Archived", short: "Archive" },
];

const OVERFLOW_FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "interested", label: "Interested" },
  { key: "appointments", label: "Appointments" },
  { key: "optouts", label: "STOP" },
  { key: "ai", label: "AI" },
];

const notesKey = (t: string) => `leadtrace:notes:${t}`;
const railsKey = (w: string) => `leadtrace:inbox:rails:${w}`;

function initialsOf(row: ThreadRow) {
  const name = row.lead?.full_name || row.lead?.business_name || row.lead?.phone || row.thread_key;
  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function displayName(row: ThreadRow | null, ctxName?: string | null) {
  return (
    ctxName ||
    row?.lead?.full_name ||
    row?.lead?.business_name ||
    row?.lead?.phone ||
    row?.thread_key ||
    "Conversation"
  );
}

function ConversationsPage() {
  const { workspaceId } = useWorkspaceId();
  const search = Route.useSearch();
  const [filter, setFilter] = useState<Filter>((search.filter as Filter | undefined) ?? "all");
  const [selected, setSelected] = useState<string | null>(search.thread ?? null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  // Read state is the default: both rails closed until the operator asks.
  const [listOpen, setListOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const team = useTeamContext();
  // Mirrors the server's launch_campaign gate on replies/blacklist so a viewer
  // sees a disabled composer instead of a rejected send.
  const canReply = team.can("launch_campaign");

  const fetchThreads = useServerFn(listThreads);
  const fetchThread = useServerFn(getThread);
  const markRead = useServerFn(markThreadRead);
  const send = useServerFn(sendReply);
  const fetchSnippets = useServerFn(listQuickReplies);
  const addSnippet = useServerFn(createQuickReply);
  const runSummary = useServerFn(summarizeThread);
  const runSuggest = useServerFn(suggestThreadReplies);
  const runBlacklist = useServerFn(blacklistThread);
  const fetchNumbers = useServerFn(listNumbers);
  const fetchWorkspaceTags = useServerFn(listTags);
  const setStarredFn = useServerFn(starThread);
  const setArchivedFn = useServerFn(archiveThread);
  const setStatusFn = useServerFn(setThreadStatus);

  // Rail layout is a per-user preference, scoped to the workspace.
  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(railsKey(workspaceId));
      if (!raw) return;
      const v = JSON.parse(raw) as { list?: boolean; details?: boolean };
      setListOpen(!!v.list);
      setDetailsOpen(!!v.details);
    } catch {
      /* corrupt preference just falls back to Read state */
    }
  }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;
    window.localStorage.setItem(
      railsKey(workspaceId),
      JSON.stringify({ list: listOpen, details: detailsOpen }),
    );
  }, [workspaceId, listOpen, detailsOpen]);

  // Below xl the context rail opens as a slide-over instead of a column.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // A reply can only leave the building from an active sending number. Without
  // one every send path fails server-side, so we surface it instead of letting
  // "Use" look like a no-op.
  const numbersQ = useQuery({
    queryKey: ["inbox-sending-numbers", workspaceId],
    queryFn: () => fetchNumbers({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  const hasSendingNumber = (numbersQ.data?.rows ?? []).some((n) => n.status === "active");
  const numbersKnown = !!numbersQ.data;

  const threadsQ = useQuery({
    queryKey: ["inbox-threads", workspaceId, filter, tagFilter],
    queryFn: () =>
      fetchThreads({
        data: { workspaceId: workspaceId!, filter, ...(tagFilter ? { tagId: tagFilter } : {}) },
      }),
    enabled: !!workspaceId,
    refetchInterval: 15000,
  });

  // Workspace tag vocabulary — shared with campaigns and the Leads page.
  const tagsQ = useQuery({
    queryKey: ["tags", workspaceId],
    queryFn: () => fetchWorkspaceTags({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const threadQ = useQuery({
    queryKey: ["inbox-thread", workspaceId, selected],
    queryFn: () => fetchThread({ data: { workspaceId: workspaceId!, threadKey: selected! } }),
    enabled: !!workspaceId && !!selected,
    refetchInterval: 10000,
  });

  const snippetsQ = useQuery({
    queryKey: ["quick-replies", workspaceId],
    queryFn: () => fetchSnippets({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  // AI summary is cached per thread + message count so it refreshes on new activity.
  const msgCount = threadQ.data?.messages.length ?? 0;
  const summaryQ = useQuery({
    queryKey: ["thread-summary", workspaceId, selected, msgCount],
    queryFn: async () => {
      const cached = readSummary(selected!, msgCount);
      if (cached !== undefined) return { summary: cached };
      const res = await runSummary({ data: { workspaceId: workspaceId!, threadKey: selected! } });
      if (res?.summary) writeSummary(selected!, msgCount, res.summary);
      return res;
    },
    enabled: !!workspaceId && !!selected && msgCount > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const suggestM = useMutation({
    mutationFn: (vars: { command?: string | null; draft?: string | null }) =>
      runSuggest({
        data: {
          workspaceId: workspaceId!,
          threadKey: selected!,
          command: vars.command ?? null,
          draft: vars.draft ?? null,
        },
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could Not Generate Replies"),
    onSuccess: (res) => {
      if (!res?.suggestions?.length)
        toast.error("AI Replies Are Unavailable Right Now — Write Your Own Or Try Again.");
    },
  });
  // Memoized so the suggestion carousel does not reset its index on every render.
  const suggestions = useMemo(() => suggestM.data?.suggestions ?? [], [suggestM.data]);

  // Archive/star/status now live server-side, so the filter tab is the whole
  // story — no client-side re-filtering that could disagree with the counts.
  const threads = useMemo(
    () => (threadsQ.data?.threads ?? []) as unknown as ThreadRow[],
    [threadsQ.data],
  );

  useEffect(() => {
    if (!selected && threads[0]) setSelected(threads[0].thread_key);
  }, [threads, selected]);

  useEffect(() => {
    if (!workspaceId || !selected) return;
    markRead({ data: { workspaceId, threadKey: selected } }).then(() => {
      qc.invalidateQueries({ queryKey: ["inbox-threads", workspaceId] });
      qc.invalidateQueries({ queryKey: ["inbox-unread", workspaceId] });
    });
  }, [selected, workspaceId, markRead, qc]);

  // Notes are private and device-local.
  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    setNotes(window.localStorage.getItem(notesKey(selected)) ?? "");
  }, [selected]);
  const saveNotes = useCallback(
    (v: string) => {
      setNotes(v);
      if (selected && typeof window !== "undefined")
        window.localStorage.setItem(notesKey(selected), v);
    },
    [selected],
  );

  // Fresh suggestions whenever a new lead reply lands on the open conversation.
  const lastMsg = threadQ.data?.messages[msgCount - 1];
  const autoKey = selected && lastMsg?.direction === "inbound" ? `${selected}:${lastMsg.id}` : null;
  const autoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoKey || autoRef.current === autoKey) return;
    autoRef.current = autoKey;
    suggestM.mutate({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [threadQ.data]);

  const activeThread = useMemo(
    () => threads.find((t) => t.thread_key === selected) ?? null,
    [threads, selected],
  );

  const timeline = useMemo(
    () => buildTimeline(threadQ.data?.messages ?? [], (b) => classifyIntent(b)),
    [threadQ.data],
  );

  const handleSend = async () => {
    if (!workspaceId || !selected || !reply.trim()) return;
    if (numbersKnown && !hasSendingNumber) return warnNoNumber();
    setSending(true);
    try {
      await send({ data: { workspaceId, threadKey: selected, body: reply.trim() } });
      setReply("");
      suggestM.reset();
      qc.invalidateQueries({ queryKey: ["inbox-thread", workspaceId, selected] });
      qc.invalidateQueries({ queryKey: ["inbox-threads", workspaceId] });
    } catch (e) {
      // The server owns the consent decision — show its exact reason.
      toast.error("Message Not Sent", {
        description: e instanceof Error ? e.message : "The server rejected this send.",
      });
    } finally {
      setSending(false);
    }
  };

  const saveSnippet = async () => {
    if (!workspaceId || !reply.trim()) return;
    try {
      await addSnippet({
        data: { workspaceId, title: reply.trim().slice(0, 40), body: reply.trim() },
      });
      qc.invalidateQueries({ queryKey: ["quick-replies", workspaceId] });
      toast.success("Saved As Quick Reply");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save Failed");
    }
  };

  const selectedRow = threads.find((t) => t.thread_key === selected) ?? null;

  const refreshInbox = () => {
    qc.invalidateQueries({ queryKey: ["inbox-threads", workspaceId] });
    qc.invalidateQueries({ queryKey: ["inbox-thread", workspaceId, selected] });
  };

  const toggleArchive = async () => {
    if (!workspaceId || !selected) return;
    const nowArchived = !selectedRow?.archived;
    try {
      await setArchivedFn({
        data: {
          workspaceId,
          threadKey: selected,
          leadId: selectedRow?.lead_id ?? null,
          archived: nowArchived,
        },
      });
      refreshInbox();
      toast.success(nowArchived ? "Conversation Archived" : "Conversation Restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Archive");
    }
  };

  const toggleStar = async (row: ThreadRow) => {
    if (!workspaceId) return;
    try {
      await setStarredFn({
        data: {
          workspaceId,
          threadKey: row.thread_key,
          leadId: row.lead_id ?? null,
          starred: !row.starred,
        },
      });
      refreshInbox();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Star");
    }
  };

  const applyStatus = async (status: ThreadStatus | null) => {
    if (!workspaceId || !selected) return;
    try {
      await setStatusFn({
        data: {
          workspaceId,
          threadKey: selected,
          leadId: selectedRow?.lead_id ?? null,
          status,
        },
      });
      refreshInbox();
      toast.success(status ? `Marked ${threadStatusLabel(status)}` : "Status Cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Update Status");
    }
  };

  const doBlacklist = async () => {
    if (!workspaceId || !selected) return;
    try {
      const r = await runBlacklist({ data: { workspaceId, threadKey: selected } });
      toast.success(`${r.phone} Added To Suppression`);
      qc.invalidateQueries({ queryKey: ["inbox-thread", workspaceId, selected] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Blacklist");
    }
  };

  const applyCommand = (cmd: string) => {
    setSlashOpen(false);
    setReply("");
    suggestM.mutate({ command: cmd });
  };

  // Messages newest-first, with a day separator emitted after the oldest
  // message of each day so it renders above that day in column-reverse order.
  const threadItems = useMemo(() => {
    const msgs = [...(threadQ.data?.messages ?? [])].reverse();
    const out: Array<{ kind: "msg"; m: (typeof msgs)[number] } | { kind: "sep"; label: string }> =
      [];
    msgs.forEach((m, i) => {
      out.push({ kind: "msg", m });
      const day = new Date(m.created_at).toDateString();
      const nextDay = msgs[i + 1] ? new Date(msgs[i + 1].created_at).toDateString() : null;
      if (day !== nextDay) out.push({ kind: "sep", label: dayLabel(m.created_at) });
    });
    return out;
  }, [threadQ.data]);

  if (!workspaceId) return null;
  const counts = threadsQ.data?.counts;
  const aiHandling = !!threadQ.data?.messages.some((m) => m.is_bot) && !threadQ.data?.handoff;

  // `is_optout` on the thread row is a CACHED DISPLAY VALUE ONLY. It is never
  // authoritative: the server-side assertCanText inside sendReply is the single
  // real consent gate. We use it here purely to pre-disable the composer.
  const optoutDisplay = !!activeThread?.is_optout;
  const needsHuman = !!threadQ.data?.handoff;
  const dotState = optoutDisplay ? "blocked" : needsHuman ? "attention" : "clear";
  const dotReason = optoutDisplay
    ? "Opted Out — Outreach Is Blocked For This Contact"
    : needsHuman
      ? "Needs Human — The AI Agent Handed This Conversation Off"
      : aiHandling
        ? "Clear — AI Handling This Conversation"
        : "Clear — No Compliance Or Handoff Flags";

  const facts: string[] = [];
  if (threadQ.data?.campaign) facts.push(threadQ.data.campaign.name);
  if (threadQ.data?.campaign) facts.push(`Touch ${threadQ.data.campaign.touch}`);

  const railBody = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto thin-scroll">
      <AiSummary
        bullets={summaryQ.data?.summary?.bullets ?? []}
        nextStep={summaryQ.data?.summary?.nextStep ?? null}
        loading={summaryQ.isFetching}
        failed={summaryQ.isError}
        onRetry={() => summaryQ.refetch()}
        onUseNextStep={() =>
          suggestM.mutate({
            command: null,
            draft: summaryQ.data?.summary?.nextStep ?? null,
          })
        }
      />
      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {aiHandling && <AiActivityPill label="AI Handling" />}
          {selectedRow?.archived && (
            <Badge variant="outline" className="h-6 gap-1 text-[10px]">
              Archived
              {selectedRow.archived_reason && selectedRow.archived_reason !== "manual"
                ? ` · ${AUTO_ARCHIVE_REASONS[selectedRow.archived_reason] ?? selectedRow.archived_reason}`
                : ""}
            </Badge>
          )}
        </div>
        <LeadTagBar
          workspaceId={workspaceId}
          leadId={threadQ.data?.lead?.id ?? null}
          open={tagPickerOpen}
          onOpenChange={setTagPickerOpen}
        />
        <dl className="space-y-1 text-[11px] text-muted-foreground">
          {threadQ.data?.lead?.phone && (
            <div className="flex items-center justify-between gap-2">
              <dt>Contact Number</dt>
              <dd className="font-mono text-foreground">
                {threadQ.data.lead.phone}
                {threadQ.data.lead.phone_type ? ` · ${threadQ.data.lead.phone_type}` : ""}
              </dd>
            </div>
          )}
          {threadQ.data?.number && (
            <div className="flex items-center justify-between gap-2">
              <dt>From Number</dt>
              <dd className="font-mono text-foreground">{threadQ.data.number.phone}</dd>
            </div>
          )}
          {activeThread && (
            <div className="flex items-center justify-between gap-2">
              <dt>Last Activity</dt>
              <dd className="text-foreground">{dayLabel(activeThread.last_at)}</dd>
            </div>
          )}
        </dl>
      </Card>
      <LeadProfilePanel
        ctx={threadQ.data ? ({ ...threadQ.data } as never) : null}
        thread={activeThread}
        events={timeline}
        notes={notes}
        onNotes={saveNotes}
        tags={activeThread?.badges ?? []}
      />
    </div>
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Conversations"
        description="Where AI And You Work Leads Together — Summaries, Suggested Replies, And Full Context."
      />
      <div
        className={cn(
          "inbox-shell grid min-h-0 grid-cols-1 gap-4",
          listOpen ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[52px_minmax(0,1fr)]",
          detailsOpen &&
            (listOpen
              ? "xl:grid-cols-[280px_minmax(0,1fr)_300px]"
              : "xl:grid-cols-[52px_minmax(0,1fr)_300px]"),
        )}
      >
        {/* Conversation list — collapsed to an avatar strip by default */}
        <Card className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-center border-b p-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 rounded-full p-0"
              aria-label={listOpen ? "Collapse Conversation List" : "Expand Conversation List"}
              onClick={() => setListOpen((v) => !v)}
            >
              {listOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>

          {!listOpen ? (
            <div className="flex-1 overflow-y-auto thin-scroll py-2">
              <div className="flex flex-col items-center gap-2">
                {threads.map((t) => (
                  <button
                    key={t.thread_key}
                    type="button"
                    title={displayName(t)}
                    aria-label={displayName(t)}
                    onClick={() => {
                      setSelected(t.thread_key);
                      suggestM.reset();
                    }}
                    className="relative"
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-full border text-[11px] font-semibold",
                        selected === t.thread_key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {initialsOf(t)}
                    </span>
                    {t.unread > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-nowrap items-center gap-0.5 overflow-hidden border-b p-2">
                {PRIMARY_FILTERS.map((f) => {
                  const active = filter === f.key;
                  const count = counts ? counts[f.key] : 0;
                  return (
                    <Button
                      key={f.key}
                      size="sm"
                      variant={active ? "default" : "ghost"}
                      className="h-7 min-w-0 shrink-0 rounded-full px-2 text-xs"
                      onClick={() => setFilter(f.key)}
                    >
                      <span className="truncate">{f.short}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "ml-1 rounded-full px-1 text-[10px] leading-4 tabular-nums",
                            active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </Button>
                  );
                })}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant={
                        tagFilter || !PRIMARY_FILTERS.some((f) => f.key === filter)
                          ? "default"
                          : "ghost"
                      }
                      className="ml-auto h-7 w-7 shrink-0 rounded-full p-0"
                      aria-label="More filters"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {OVERFLOW_FILTERS.map((f) => {
                      const count = counts ? (counts[f.key] ?? 0) : 0;
                      const active = filter === f.key;
                      return (
                        <DropdownMenuItem
                          key={f.key}
                          onClick={() => setFilter(f.key)}
                          className={cn("justify-between text-xs", active && "font-semibold")}
                        >
                          <span>{f.label}</span>
                          {count > 0 && (
                            <span className="rounded-full bg-muted px-1 text-[10px] leading-4 text-muted-foreground tabular-nums">
                              {count}
                            </span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    {(tagsQ.data?.tags ?? []).length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Lead Tags
                        </DropdownMenuLabel>
                        {tagFilter && (
                          <DropdownMenuItem className="text-xs" onClick={() => setTagFilter(null)}>
                            Clear Tag Filter
                          </DropdownMenuItem>
                        )}
                        {(tagsQ.data?.tags ?? []).map((t) => (
                          <DropdownMenuItem
                            key={t.id}
                            onClick={() => {
                              setTagFilter(tagFilter === t.id ? null : t.id);
                            }}
                            className={cn("gap-2 text-xs", tagFilter === t.id && "font-semibold")}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: t.color }}
                            />
                            <span className="truncate">{t.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex-1 overflow-y-auto">
                {threadsQ.isLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <Loader2 className="mr-1 inline-block h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : threadsQ.isError ? (
                  <div className="space-y-2 p-6 text-center text-sm text-muted-foreground">
                    <p>Could Not Load Conversations.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full text-xs"
                      onClick={() => void threadsQ.refetch()}
                    >
                      Try Again
                    </Button>
                  </div>
                ) : !threads.length ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <InboxIcon className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    No Conversations Here.
                  </div>
                ) : (
                  threads.map((t) => (
                    <ConversationRow
                      key={t.thread_key}
                      thread={t}
                      active={selected === t.thread_key}
                      onSelect={() => {
                        setSelected(t.thread_key);
                        suggestM.reset();
                      }}
                      onToggleStar={() => void toggleStar(t)}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </Card>

        {/* Conversation */}
        <Card className="flex h-full min-h-0 flex-col">
          {!selected ? (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              Select A Conversation.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <ContextStrip
                name={displayName(
                  activeThread,
                  threadQ.data?.lead?.full_name || threadQ.data?.lead?.business_name,
                )}
                phone={threadQ.data?.lead?.phone ?? activeThread?.lead?.phone ?? null}
                facts={facts}
                state={dotState}
                stateReason={dotReason}
                statusLabel={threadStatusLabel(selectedRow?.status)}
                statusOptions={THREAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                onSelectStatus={(v) => void applyStatus((v as ThreadStatus | null) ?? null)}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((v) => !v)}
                disabled={!team.canWrite}
              />

              <ConversationThread scrollRef={scrollerRef}>
                {suggestM.isPending && (
                  <div className="flex justify-end">
                    <AiActivityPill label="AI Composing" />
                  </div>
                )}
                {threadItems.map((item, i) =>
                  item.kind === "sep" ? (
                    <DateSeparator key={`sep-${i}`} label={item.label} />
                  ) : (item.m as { channel?: string | null }).channel === "voice" ? (
                    <VoiceMessageItem
                      key={item.m.id}
                      event={(item.m as { call_event?: string | null }).call_event ?? null}
                      createdAt={item.m.created_at}
                      recordingUrl={
                        (item.m as { recording_url?: string | null }).recording_url ?? null
                      }
                      seconds={
                        (item.m as { recording_seconds?: number | null }).recording_seconds ?? null
                      }
                      transcript={(item.m as { transcript?: string | null }).transcript ?? null}
                    />
                  ) : (
                    <MessageBubble
                      key={item.m.id}
                      align={item.m.direction === "outbound" ? "right" : "left"}
                      body={item.m.body ?? ""}
                      isBot={!!item.m.is_bot}
                      meta={`${new Date(item.m.created_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })} · ${dayLabel(item.m.created_at)} · ${item.m.status}`}
                    />
                  ),
                )}
              </ConversationThread>

              {numbersKnown && !hasSendingNumber && (
                <div className="mx-auto mb-2 flex w-full max-w-[520px] items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                  <PhoneOff className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="flex-1 text-[11px] text-muted-foreground">
                    No Active Sending Number — Replies Cannot Be Delivered Yet. Drafts Are Still
                    Saved Here.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="h-6 shrink-0 rounded-full px-2.5 text-[10px]"
                  >
                    <Link to="/app/numbers">Get A Number</Link>
                  </Button>
                </div>
              )}

              <MessageComposer
                value={reply}
                onChange={(v) => {
                  setReply(v);
                  setSlashOpen(v.startsWith("/"));
                }}
                onSend={handleSend}
                sending={sending}
                disabled={
                  optoutDisplay || sending || !canReply || (numbersKnown && !hasSendingNumber)
                }
                readOnly={!canReply}
                placeholder={
                  optoutDisplay
                    ? "Contact has opted out — replies disabled."
                    : canReply
                      ? "Type a reply… / for AI commands"
                      : "Read-Only Access — Ask An Admin To Send Replies."
                }
                sendTitle={
                  !canReply
                    ? "Your Role Is Read-Only — Replies Are Disabled"
                    : numbersKnown && !hasSendingNumber
                      ? "Add An Active Sending Number To Send Replies"
                      : undefined
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSlashOpen(false);
                    if (!slashOpen) setReply("");
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (slashOpen) {
                      const match = SLASH_COMMANDS.find((c) => c.cmd === reply.trim());
                      if (match) return applyCommand(match.cmd);
                    }
                    handleSend();
                  }
                }}
                above={
                  <SuggestedReplies
                    suggestions={suggestions}
                    loading={suggestM.isPending}
                    onUse={(body) => {
                      setReply(body);
                      if (numbersKnown && !hasSendingNumber) {
                        warnNoNumber();
                        return;
                      }
                      void handleSendWith(body);
                    }}
                    onEdit={(body) => setReply(body)}
                    onRegenerate={() => suggestM.mutate({})}
                  />
                }
                overlay={
                  slashOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-xl border bg-popover shadow-lg">
                      <div className="border-b px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        AI Commands
                      </div>
                      {SLASH_COMMANDS.filter((c) =>
                        c.cmd.startsWith(reply.trim().split(" ")[0] || "/"),
                      ).map((c) => (
                        <button
                          key={c.cmd}
                          onClick={() => applyCommand(c.cmd)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
                        >
                          <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                          <span className="text-xs font-semibold">{c.label}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">{c.cmd}</span>
                        </button>
                      ))}
                    </div>
                  ) : null
                }
                menu={
                  <>
                    {!!snippetsQ.data?.snippets.length && (
                      <>
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Quick Replies
                        </DropdownMenuLabel>
                        {snippetsQ.data.snippets.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            className="text-xs"
                            onClick={() => setReply(s.body)}
                          >
                            <span className="truncate">{s.title}</span>
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      className="text-xs"
                      disabled={!reply.trim() || !canReply}
                      onClick={() => void saveSnippet()}
                    >
                      <Plus className="h-3.5 w-3.5" /> Save As Quick Reply
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      disabled={suggestM.isPending || !canReply}
                      onClick={() => suggestM.mutate({ draft: reply.trim() || null })}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Ask AI For A Reply
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs"
                      disabled={!threadQ.data?.lead?.phone}
                      onClick={() => {
                        const p = threadQ.data?.lead?.phone;
                        if (p) window.location.href = `tel:${p.replace(/[^0-9+]/g, "")}`;
                      }}
                    >
                      <Phone className="h-3.5 w-3.5" /> Call
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      disabled={!threadQ.data?.lead?.email}
                      onClick={() => {
                        const em = threadQ.data?.lead?.email;
                        if (em) window.location.href = `mailto:${em}`;
                      }}
                    >
                      <Mail className="h-3.5 w-3.5" /> Email
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      onClick={() => {
                        setReply(
                          "Great — I have a couple of times open. Does tomorrow morning or afternoon work better?",
                        );
                        toast.success("Appointment Ask Drafted");
                      }}
                    >
                      <CalendarPlus className="h-3.5 w-3.5" /> Appointment Ask
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      disabled={!team.canWrite}
                      onClick={() => {
                        setDetailsOpen(true);
                        setTagPickerOpen(true);
                      }}
                    >
                      <TagIcon className="h-3.5 w-3.5" /> Tag
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      disabled={!team.canWrite}
                      onClick={() => void toggleArchive()}
                    >
                      <Archive className="h-3.5 w-3.5" />{" "}
                      {selectedRow?.archived ? "Unarchive" : "Archive"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs text-danger focus:text-danger"
                      disabled={!team.canWrite}
                      onClick={() => void doBlacklist()}
                    >
                      <Ban className="h-3.5 w-3.5" /> Blacklist
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs"
                      disabled={!reply.trim()}
                      onClick={() => setReply("")}
                    >
                      <X className="h-3.5 w-3.5" /> Discard Draft
                    </DropdownMenuItem>
                  </>
                }
              />
            </div>
          )}
        </Card>

        {/* Context rail — a column at xl, a slide-over below it */}
        {detailsOpen && selected && wide && (
          <div className="hidden min-h-0 flex-col xl:flex">{railBody}</div>
        )}
      </div>

      <Sheet open={detailsOpen && !!selected && !wide} onOpenChange={(o) => setDetailsOpen(o)}>
        <SheetContent
          side="right"
          className="flex w-[92vw] max-w-[360px] flex-col gap-2 overflow-hidden p-4"
        >
          <SheetHeader className="p-0">
            <SheetTitle className="text-sm">Lead Details</SheetTitle>
          </SheetHeader>
          {railBody}
        </SheetContent>
      </Sheet>
    </div>
  );

  async function handleSendWith(body: string) {
    if (!workspaceId || !selected) return;
    if (numbersKnown && !hasSendingNumber) return warnNoNumber();
    setSending(true);
    try {
      await send({ data: { workspaceId, threadKey: selected, body } });
      setReply("");
      suggestM.reset();
      qc.invalidateQueries({ queryKey: ["inbox-thread", workspaceId, selected] });
      qc.invalidateQueries({ queryKey: ["inbox-threads", workspaceId] });
    } catch (e) {
      // Surface the server's specific rejection reason, not a generic failure.
      toast.error("Message Not Sent", {
        description: e instanceof Error ? e.message : "The server rejected this send.",
      });
    } finally {
      setSending(false);
    }
  }

  function warnNoNumber() {
    toast.error("No Active Sending Number", {
      description: "Your Draft Is In The Composer. Add A Sending Number To Deliver Replies.",
      action: { label: "Get A Number", onClick: () => void navigate({ to: "/app/numbers" }) },
    });
  }
}
