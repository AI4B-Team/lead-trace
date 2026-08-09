import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bot, Inbox as InboxIcon, Loader2, MoreVertical, PhoneOff, Plus, Send, Sparkles, X } from "lucide-react";
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
import {
  AiActivityPill,
  AiSummary,
  ConversationRow,
  LeadProfilePanel,
  QuickActions,
  SuggestedReplies,
  buildTimeline,
  type ThreadRow,
} from "@/components/app/conversation-panels";
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
        content: "The AI sales command center: summaries, suggested replies, and full lead context on every SMS conversation.",
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

function ConversationsPage() {
  const { workspaceId } = useWorkspaceId();
  const search = Route.useSearch();
  const [filter, setFilter] = useState<Filter>(
    (search.filter as Filter | undefined) ?? "all",
  );
  const [selected, setSelected] = useState<string | null>(search.thread ?? null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
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
    queryFn: () => runSummary({ data: { workspaceId: workspaceId!, threadKey: selected! } }),
    enabled: !!workspaceId && !!selected && msgCount > 0,
    staleTime: 5 * 60_000,
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
  });
  const suggestions = suggestM.data?.suggestions ?? [];

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
      if (selected && typeof window !== "undefined") window.localStorage.setItem(notesKey(selected), v);
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
      toast.error(e instanceof Error ? e.message : "Send Failed.");
    } finally {
      setSending(false);
    }
  };

  const saveSnippet = async () => {
    if (!workspaceId || !reply.trim()) return;
    try {
      await addSnippet({ data: { workspaceId, title: reply.trim().slice(0, 40), body: reply.trim() } });
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

  if (!workspaceId) return null;
  const counts = threadsQ.data?.counts;
  const aiHandling = !!threadQ.data?.messages.some((m) => m.is_bot) && !threadQ.data?.handoff;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Conversations"
        description="Where AI And You Work Leads Together — Summaries, Suggested Replies, And Full Context."
      />
      <div className="inbox-shell grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)_288px]">
        {/* Conversation list */}
        <Card className="flex flex-col min-h-0">
          <div className="shrink-0 p-2 border-b flex items-center gap-0.5 flex-nowrap overflow-hidden">
            {PRIMARY_FILTERS.map((f) => {
              const active = filter === f.key;
              const count = counts ? counts[f.key] : 0;
              return (
                <Button
                  key={f.key}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className="rounded-full text-xs h-7 px-2 shrink-0 min-w-0"
                  onClick={() => setFilter(f.key)}
                >
                  <span className="truncate">
                    <span className="hidden 2xl:inline">{f.label}</span>
                    <span className="2xl:hidden">{f.short}</span>
                  </span>
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
                  className="rounded-full h-7 w-7 p-0 shrink-0 ml-auto"
                  aria-label="More filters"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {OVERFLOW_FILTERS.map((f) => {
                  const count = counts ? counts[f.key] ?? 0 : 0;
                  const active = filter === f.key;
                  return (
                    <DropdownMenuItem
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={cn("text-xs justify-between", active && "font-semibold")}
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
                        className={cn("text-xs gap-2", tagFilter === t.id && "font-semibold")}
                      >
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: t.color }} />
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
                <Loader2 className="h-4 w-4 animate-spin inline-block mr-1" /> Loading…
              </div>
            ) : !threads.length ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <InboxIcon className="h-6 w-6 mx-auto mb-2 opacity-40" />
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
        </Card>

        {/* Conversation */}
        <Card className="flex flex-col h-full min-h-0">
          {!selected ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">Select A Conversation.</div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Top: contact header, actions, AI summary — stays fixed */}
              <div className="shrink-0">
                <div className="p-3 border-b space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold truncate">
                        {threadQ.data?.lead?.full_name ||
                          threadQ.data?.lead?.business_name ||
                          threadQ.data?.lead?.phone ||
                          activeThread?.thread_key}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-2">
                        {threadQ.data?.campaign && <span>{threadQ.data.campaign.name}</span>}
                        {threadQ.data?.campaign && <span>· Touch {threadQ.data.campaign.touch}</span>}
                        {threadQ.data?.number && <span>· From {threadQ.data.number.phone}</span>}
                        {activeThread && <span>· {dayLabel(activeThread.last_at)}</span>}
                      </div>
                    </div>
                    {aiHandling && <AiActivityPill label="AI Handling" />}
                    {threadQ.data?.handoff && (
                      <Badge variant="outline" className="bg-warn/10 text-warn border-warn/20 text-xs">
                        Needs Human
                      </Badge>
                    )}
                    {activeThread?.is_optout && (
                      <Badge variant="outline" className="bg-danger/10 text-danger border-danger/20">
                        Opted Out
                      </Badge>
                    )}
                  </div>
                  <QuickActions
                    phone={threadQ.data?.lead?.phone}
                    email={threadQ.data?.lead?.email}
                    onAppointment={() => {
                      setReply("Great — I have a couple of times open. Does tomorrow morning or afternoon work better?");
                      toast.success("Appointment Ask Drafted");
                    }}
                    onArchive={toggleArchive}
                    onTag={() => setTagPickerOpen(true)}
                    onBlacklist={doBlacklist}
                    archived={!!selectedRow?.archived}
                    blacklisting={false}
                  />
                  <LeadTagBar
                    workspaceId={workspaceId}
                    leadId={threadQ.data?.lead?.id ?? null}
                    open={tagPickerOpen}
                    onOpenChange={setTagPickerOpen}
                  />
                </div>

                {/* Where this contact stands. Set here, mirrored onto the lead
                    record so the Leads library and reporting agree. */}
                <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </span>
                  {THREAD_STATUSES.map((s) => {
                    const active = selectedRow?.status === s.value;
                    return (
                      <Button
                        key={s.value}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-6 rounded-full px-2 text-[11px]"
                        onClick={() => void applyStatus(active ? null : s.value)}
                      >
                        {s.label}
                      </Button>
                    );
                  })}
                  {selectedRow?.archived && (
                    <Badge variant="outline" className="ml-auto h-6 gap-1 text-[10px]">
                      Archived
                      {selectedRow.archived_reason && selectedRow.archived_reason !== "manual"
                        ? ` · ${AUTO_ARCHIVE_REASONS[selectedRow.archived_reason] ?? selectedRow.archived_reason}`
                        : ""}
                    </Badge>
                  )}
                </div>

                <AiSummary
                  bullets={summaryQ.data?.summary?.bullets ?? []}
                  nextStep={summaryQ.data?.summary?.nextStep ?? null}
                  loading={summaryQ.isFetching}
                  onUseNextStep={() => suggestM.mutate({ command: null, draft: summaryQ.data?.summary?.nextStep ?? null })}
                />
              </div>

              {/* Middle: scrollable message thread — flexes to absorb available height */}
              <div
                ref={scrollerRef}
                className="flex-1 min-h-0 overflow-y-auto thin-scroll p-4 flex flex-col-reverse gap-2"
              >
                {suggestM.isPending && (
                  <div className="flex justify-end">
                    <AiActivityPill label="AI Composing" />
                  </div>
                )}
                {[...(threadQ.data?.messages ?? [])].reverse().map((m) =>
                  (m as { channel?: string | null }).channel === "voice" ? (
                    <VoiceMessageItem
                      key={m.id}
                      event={(m as { call_event?: string | null }).call_event ?? null}
                      createdAt={m.created_at}
                      recordingUrl={(m as { recording_url?: string | null }).recording_url ?? null}
                      seconds={(m as { recording_seconds?: number | null }).recording_seconds ?? null}
                      transcript={(m as { transcript?: string | null }).transcript ?? null}
                    />
                  ) : (
                  <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        m.direction === "outbound"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm",
                      )}
                    >
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div
                        className={cn(
                          "text-[10px] mt-1 opacity-70 flex items-center gap-1",
                          m.direction === "outbound" ? "text-primary-foreground" : "text-muted-foreground",
                        )}
                      >
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ·{" "}
                        {dayLabel(m.created_at)} · {m.status}
                        {m.is_bot && (
                          <>
                            {" · "}
                            <Bot className="h-2.5 w-2.5" /> AI
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  ),
                )}
              </div>

              {/* Bottom: suggested replies, no-number banner, snippets, composer — pinned to fold */}
              <div className="shrink-0">
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

                {numbersKnown && !hasSendingNumber && (
                  <div className="mx-3 mt-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 flex items-center gap-2">
                    <PhoneOff className="h-3.5 w-3.5 text-primary shrink-0" />
                    <p className="text-[11px] text-muted-foreground flex-1">
                      No Active Sending Number — Replies Cannot Be Delivered Yet. Drafts Are Still Saved Here.
                    </p>
                    <Button asChild size="sm" className="h-6 rounded-full text-[10px] px-2.5 shrink-0">
                      <Link to="/app/numbers">Get A Number</Link>
                    </Button>
                  </div>
                )}
                {!!snippetsQ.data?.snippets.length && (
                  <div className="px-3 pt-2 flex flex-wrap gap-1">
                    {snippetsQ.data.snippets.map((s) => (
                      <Button
                        key={s.id}
                        size="sm"
                        variant="outline"
                        className="rounded-full h-7 text-xs"
                        onClick={() => setReply(s.body)}
                      >
                        {s.title}
                      </Button>
                    ))}
                  </div>
                )}

                <div className="p-3 border-t relative">
                  {slashOpen && (
                    <div className="absolute bottom-full left-3 mb-1 w-72 rounded-xl border bg-popover shadow-lg overflow-hidden z-20">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b">
                        AI Commands
                      </div>
                      {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(reply.trim().split(" ")[0] || "/")).map((c) => (
                        <button
                          key={c.cmd}
                          onClick={() => applyCommand(c.cmd)}
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2"
                        >
                          <Sparkles className="h-3 w-3 text-primary shrink-0" />
                          <span className="text-xs font-semibold">{c.label}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{c.cmd}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="rounded-2xl border bg-background focus-within:ring-2 focus-within:ring-ring transition-shadow">
                    <textarea
                      value={reply}
                      onChange={(e) => {
                        setReply(e.target.value);
                        setSlashOpen(e.target.value.startsWith("/"));
                      }}
                      rows={4}
                      placeholder={
                        activeThread?.is_optout
                          ? "Contact has opted out — replies disabled."
                          : canReply
                            ? "Type a reply… / for AI commands"
                            : "Read-Only Access — Ask An Admin To Send Replies."
                      }
                      disabled={activeThread?.is_optout || sending}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setSlashOpen(false);
                        if (e.key === "Escape" && !slashOpen) setReply("");
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (slashOpen) {
                            const match = SLASH_COMMANDS.find((c) => c.cmd === reply.trim());
                            if (match) return applyCommand(match.cmd);
                          }
                          handleSend();
                        }
                      }}
                      className="w-full min-h-[96px] max-h-56 bg-transparent px-4 pt-3 pb-1 text-sm resize-none focus-visible:outline-none disabled:opacity-60"
                    />
                    <div className="flex items-center gap-1 px-2 pb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-full text-xs cursor-pointer"
                        title="Save As Quick Reply"
                        onClick={saveSnippet}
                        disabled={!reply.trim()}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-full text-xs cursor-pointer"
                        title="Ask AI For A Reply"
                        onClick={() => suggestM.mutate({ draft: reply.trim() || null })}
                        disabled={suggestM.isPending}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" /> AI
                      </Button>
                      {!!reply.trim() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full text-xs cursor-pointer text-muted-foreground"
                          title="Discard This Draft (Esc)"
                          onClick={() => setReply("")}
                          disabled={sending}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                      )}
                      <Button
                        onClick={handleSend}
                        disabled={
                          activeThread?.is_optout ||
                          sending ||
                          !reply.trim() ||
                          (numbersKnown && !hasSendingNumber)
                        }
                        size="sm"
                        className="ml-auto h-8 rounded-full px-4 cursor-pointer"
                        title={
                          numbersKnown && !hasSendingNumber
                            ? "Add An Active Sending Number To Send Replies"
                            : undefined
                        }
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1" /> Send</>}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Lead profile rail */}
        <div className="hidden xl:flex flex-col min-h-0">
          <LeadProfilePanel
            ctx={threadQ.data ? ({ ...threadQ.data } as never) : null}
            thread={activeThread}
            events={timeline}
            notes={notes}
            onNotes={saveNotes}
            tags={activeThread?.badges ?? []}
          />
        </div>
      </div>
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
      toast.error(e instanceof Error ? e.message : "Send Failed.");
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
