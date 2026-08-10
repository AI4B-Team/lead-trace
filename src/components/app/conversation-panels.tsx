/**
 * Presentation pieces for the Conversations workspace: AI summary, suggested
 * replies, the lead profile rail, and the AI activity timeline.
 */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { threadStatusLabel } from "@/lib/thread-states.shared";
import { cn } from "@/lib/utils";
import { LeadTagChips } from "@/components/app/lead-tag-picker";
import { PhoneLink } from "@/components/app/phone-link";
import {
  BADGE_TONE,
  SENTIMENT_LABEL,
  dayLabel,
  relativeShort,
  scoreLabel,
  starsFor,
  type ConvoBadge,
  type Intent,
  type Sentiment,
} from "@/lib/conversation-intel";
import {
  Archive,
  Ban,
  Bot,
  CalendarPlus,
  ChevronDown,
  Copy,
  Home,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Sparkles,
  Star,
  Tag as TagIcon,
  UserRound,
  Zap,
} from "lucide-react";

const TONE_CLASS: Record<"success" | "warn" | "danger" | "info", string> = {
  success: "bg-success/10 text-success border-success/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-primary/10 text-primary border-primary/25",
};

export function ConvoBadgeChip({ badge, className }: { badge: ConvoBadge; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0 h-[18px]", TONE_CLASS[BADGE_TONE[badge]], className)}
    >
      {badge}
    </Badge>
  );
}

export function Stars({ score, className }: { score: number; className?: string }) {
  const n = starsFor(score);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-3 w-3", i <= n ? "fill-warn text-warn" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

export type ThreadRow = {
  thread_key: string;
  last_body: string | null;
  last_direction: string;
  last_at: string;
  unread: number;
  is_optout: boolean;
  bot_active: boolean;
  needs_reply: boolean;
  score: number;
  intent: Intent;
  sentiment: Sentiment;
  badges: ConvoBadge[];
  lead: { full_name: string | null; business_name: string | null; phone: string | null; city: string | null; state: string | null } | null;
  lead_tags?: Array<{ id: string; name: string; color: string }>;
  campaign: { name: string; status: string | null } | null;
  lead_id?: string | null;
  /** Inbox workflow state, stored server-side per conversation. */
  starred?: boolean;
  archived?: boolean;
  archived_reason?: string | null;
  status?: string | null;
};

/** Rich conversation row — who, what they want, how hot, and when. */
export function ConversationRow({
  thread,
  active,
  onSelect,
  onToggleStar,
}: {
  thread: ThreadRow;
  active: boolean;
  onSelect: () => void;
  /** Star toggle lives on the row so triage never needs the thread open. */
  onToggleStar?: () => void;
}) {
  const name = thread.lead?.full_name || thread.lead?.business_name || thread.lead?.phone || thread.thread_key;
  const statusDot = thread.is_optout
    ? "bg-danger"
    : thread.intent === "appointment"
      ? "bg-primary"
      : thread.intent === "qualified"
        ? "bg-success"
        : thread.needs_reply
          ? "bg-warn"
          : "bg-muted-foreground/40";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group w-full cursor-pointer text-left px-3 py-4 border-b transition-colors hover:bg-muted/40",
        active && "bg-muted/70 border-l-2 border-l-primary",
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", statusDot, thread.needs_reply && !thread.is_optout && "animate-pulse")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold truncate text-sm">{name}</span>
            <span className="flex shrink-0 items-center gap-1">
              {onToggleStar && (
                <button
                  type="button"
                  aria-label={thread.starred ? "Remove star" : "Star conversation"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar();
                  }}
                  className={cn(
                    "rounded p-0.5 transition-colors hover:bg-muted",
                    thread.starred ? "text-warn" : "text-muted-foreground/50 hover:text-muted-foreground",
                  )}
                >
                  <Star className={cn("h-3.5 w-3.5", thread.starred && "fill-current")} />
                </button>
              )}
              <span className="text-[10px] text-muted-foreground">{dayLabel(thread.last_at)}</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {thread.last_direction === "outbound" ? "You: " : ""}
            {thread.last_body}
          </p>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {thread.badges.slice(0, 1).map((b) => (
              <ConvoBadgeChip key={b} badge={b} />
            ))}
            {thread.badges.length > 1 && (
              <span className="text-[10px] text-muted-foreground">+{thread.badges.length - 1}</span>
            )}
            {thread.bot_active && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] gap-1">
                <Bot className="h-2.5 w-2.5" /> AI
              </Badge>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              <Stars score={thread.score} />
              {thread.unread > 0 && (
                <span className="rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 min-w-[18px] text-center">
                  {thread.unread}
                </span>
              )}
            </span>
          </div>
          {!!thread.lead_tags?.length && (
            <div className="mt-1.5">
              <LeadTagChips tags={thread.lead_tags} max={3} />
            </div>
          )}
          {thread.status && (
            <div className="mt-1.5">
              <Badge variant="outline" className="h-[18px] px-1.5 py-0 text-[10px]">
                {threadStatusLabel(thread.status) ?? thread.status}
              </Badge>
            </div>
          )}
          {thread.campaign && (
            <div className="text-[10px] text-muted-foreground mt-1.5 truncate">{thread.campaign.name}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** AI summary strip that sits above the transcript. */
export function AiSummary({
  bullets,
  nextStep,
  loading,
  failed,
  onRetry,
  onUseNextStep,
}: {
  bullets: string[];
  nextStep: string | null;
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  onUseNextStep?: () => void;
}) {
  return (
    <div className="border-b bg-muted/20 px-4 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Summary</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      {loading && !bullets.length ? (
        <p className="text-xs text-muted-foreground">Reading The Conversation…</p>
      ) : failed && !bullets.length ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Summary Unavailable Right Now.</p>
          {onRetry && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={onRetry}>
              Try Again
            </Button>
          )}
        </div>
      ) : bullets.length ? (
        <ul className="space-y-0.5">
          {bullets.map((b) => (
            <li key={b} className="text-xs text-foreground flex gap-1.5">
              <span className="text-primary">•</span>
              {b}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No Summary Yet — Send Or Receive A Message.</p>
      )}
      {nextStep && (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs">
          <Zap className="h-3 w-3 text-primary mt-[3px] shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">Recommended: </span>
            {nextStep}
          </span>
          {onUseNextStep && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 shrink-0" onClick={onUseNextStep}>
              Draft It
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One compact suggestion at a time — the AI supports the conversation instead of
 * dominating it. Cycle tones with Next; expand only when curious.
 */
export function SuggestedReplies({
  suggestions,
  loading,
  onUse,
  onEdit,
  onRegenerate,
}: {
  suggestions: Array<{ tone: string; body: string }>;
  loading: boolean;
  onUse: (body: string) => void;
  onEdit: (body: string) => void;
  onRegenerate: () => void;
}) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [suggestions]);
  if (!loading && !suggestions.length) return null;

  const active = suggestions[Math.min(i, Math.max(suggestions.length - 1, 0))];

  return (
    <div className="border-t bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
          {loading ? "Drafting…" : "Suggested"}
        </span>
        {active && (
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider shrink-0">
            {active.tone}
          </span>
        )}
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {suggestions.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2"
                onClick={() => setI((v) => (v + 1) % suggestions.length)}
              >
                Next ({(i % suggestions.length) + 1}/{suggestions.length})
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onRegenerate}>
              Regenerate
            </Button>
          </div>
        )}
      </div>
      {loading && !active ? (
        <div className="mt-1.5 h-8 rounded-lg bg-muted animate-pulse" />
      ) : active ? (
        <div className="mt-1.5 flex items-start gap-2">
        <p className="text-xs text-foreground flex-1 whitespace-pre-wrap line-clamp-4">{active.body}</p>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" className="h-6 text-[10px] px-2 rounded-full" onClick={() => onUse(active.body)}>
              Use
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 rounded-full"
              onClick={() => onEdit(active.body)}
            >
              Edit
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type TimelineEvent = { at: string; label: string; kind: "sent" | "received" | "ai" | "human" | "system" };

/** Build an intelligent activity trail from raw messages. */
export function buildTimeline(
  messages: Array<{ id: string; direction: string; body: string | null; created_at: string; is_bot: boolean; handoff_reason: string | null; status: string | null; is_optout: boolean | null }>,
  intentOf: (body: string | null) => Intent,
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const m of messages) {
    if (m.direction === "outbound") {
      out.push({
        at: m.created_at,
        label: m.is_bot ? "AI Sent Reply" : "You Sent A Message",
        kind: m.is_bot ? "ai" : "human",
      });
    } else {
      out.push({ at: m.created_at, label: "Lead Replied", kind: "received" });
      const intent = intentOf(m.body);
      if (m.is_optout) out.push({ at: m.created_at, label: "STOP Detected — Suppressed", kind: "system" });
      else if (intent === "appointment") out.push({ at: m.created_at, label: "AI Detected Appointment Intent", kind: "ai" });
      else if (intent === "qualified") out.push({ at: m.created_at, label: "AI Detected Interest", kind: "ai" });
      else if (intent === "question") out.push({ at: m.created_at, label: "AI Detected A Question", kind: "ai" });
      else if (intent === "negative") out.push({ at: m.created_at, label: "AI Detected Objection", kind: "ai" });
    }
    if (m.handoff_reason) out.push({ at: m.created_at, label: `Handed Off To Human · ${m.handoff_reason.replace(/_/g, " ")}`, kind: "system" });
  }
  return out;
}

const KIND_STYLE: Record<TimelineEvent["kind"], string> = {
  sent: "bg-muted-foreground",
  received: "bg-primary",
  ai: "bg-success",
  human: "bg-foreground",
  system: "bg-warn",
};

export function AiTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-xs text-muted-foreground">No Activity Yet.</p>;
  return (
    <ol className="relative pl-4">
      <span className="absolute left-[3px] top-1 bottom-1 w-px bg-border" />
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative pb-2.5 last:pb-0">
          <span className={cn("absolute -left-4 top-1 h-[7px] w-[7px] rounded-full", KIND_STYLE[e.kind])} />
          <div className="text-[11px] font-medium leading-tight">{e.label}</div>
          <div className="text-[10px] text-muted-foreground">
            {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {dayLabel(e.at)}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-xs font-medium text-right break-words">{children}</span>
    </div>
  );
}

export type ThreadContext = {
  lead: {
    full_name: string | null;
    business_name: string | null;
    phone: string | null;
    phone_type: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    address: string | null;
    scrub_status: string | null;
    source_meta: unknown;
    created_at: string;
  } | null;
  campaign: { name: string; status: string | null; step_count: number; touch: number } | null;
  job: { name: string | null; source_type: string; record_type: string; params: unknown } | null;
  brand: { name: string } | null;
  tag: { name: string; color: string } | null;
  record: { disposition: string; source_types: string[]; record_types: string[]; list_count: number; first_seen_at: string } | null;
  suppressed: boolean;
};

const SOURCE_LABEL: Record<string, string> = {
  upload: "Uploaded List",
  business_search: "Business Search",
  public_records: "Public Records",
  assistant: "AI Assistant",
};

/** Quick actions bar shown above the transcript. */
export function QuickActions({
  phone,
  email,
  onAppointment,
  onArchive,
  onTag,
  onBlacklist,
  archived,
  blacklisting,
  readOnly = false,
}: {
  phone?: string | null;
  email?: string | null;
  onAppointment: () => void;
  onArchive: () => void;
  onTag: () => void;
  onBlacklist: () => void;
  archived: boolean;
  blacklisting: boolean;
  /** Viewer role: mutating items are disabled to match the server gate. */
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Button asChild size="sm" variant="outline" className="h-7 rounded-full text-xs" disabled={!phone}>
        <a href={phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : undefined}>
          <Phone className="h-3 w-3 mr-1" /> Call
        </a>
      </Button>
      <Button asChild size="sm" variant="outline" className="h-7 rounded-full text-xs" disabled={!email}>
        <a href={email ? `mailto:${email}` : undefined}>
          <Mail className="h-3 w-3 mr-1" /> Email
        </a>
      </Button>
      <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={onAppointment}>
        <CalendarPlus className="h-3 w-3 mr-1" /> Appointment
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0" aria-label="More Actions">
            {blacklisting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onTag} disabled={readOnly} className="cursor-pointer text-xs">
            <TagIcon className="h-3.5 w-3.5" /> Tag
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive} disabled={readOnly} className="cursor-pointer text-xs">
            <Archive className="h-3.5 w-3.5" /> {archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onBlacklist} disabled={blacklisting || readOnly} className="cursor-pointer text-xs text-danger focus:text-danger">
            <Ban className="h-3.5 w-3.5" /> Blacklist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The right rail: CRM-grade lead context, score, property data and timeline. */
export function LeadProfilePanel({
  ctx,
  thread,
  events,
  notes,
  onNotes,
  tags,
}: {
  ctx: ThreadContext | null;
  thread: ThreadRow | null;
  events: TimelineEvent[];
  notes: string;
  onNotes: (v: string) => void;
  tags: string[];
}) {
  const lead = ctx?.lead ?? null;
  const name = lead?.full_name || lead?.business_name || thread?.lead?.phone || "Unknown Lead";
  const score = thread?.score ?? 0;
  const property = useMemo(() => {
    const meta = (lead?.source_meta ?? null) as Record<string, unknown> | null;
    if (!meta) return null;
    const pick = (k: string) => (typeof meta[k] === "string" || typeof meta[k] === "number" ? String(meta[k]) : null);
    const fields = {
      estimated_value: pick("estimated_value") ?? pick("est_value"),
      owner_since: pick("owner_since") ?? pick("purchase_year"),
      tax_delinquent: pick("tax_delinquent"),
      violations: pick("code_violations") ?? pick("violations"),
      beds: pick("beds"),
      sqft: pick("sqft"),
    };
    return Object.values(fields).some(Boolean) ? fields : null;
  }, [lead?.source_meta]);

  return (
    <Card className="flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 border-b">
        <div className="flex items-start gap-2">
          <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center shrink-0">
            <UserRound className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold truncate">{name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {lead?.business_name && lead.business_name !== name ? lead.business_name : null}
              {lead?.city ? `${lead.business_name && lead.business_name !== name ? " · " : ""}${lead.city}, ${lead.state ?? ""}` : null}
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border bg-muted/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Lead Score</span>
            <Stars score={score} />
          </div>
          <div className="flex items-end gap-2 mt-1">
            <span className="font-display text-2xl font-black leading-none">{score}</span>
            <span className="text-[11px] text-muted-foreground pb-0.5">{scoreLabel(score)}</span>
          </div>
          <Progress value={score} className="h-1.5 mt-2" />
          {thread && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {thread.badges.slice(0, 1).map((b) => (
                <ConvoBadgeChip key={b} badge={b} />
              ))}
              <span className="text-[10px] text-muted-foreground">{SENTIMENT_LABEL[thread.sentiment]}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 divide-y">
        <RailSection icon={UserRound} title="Lead" defaultOpen>
          <Field label="Phone">
            <PhoneLink phone={lead?.phone} showIcon={false} />
          </Field>
          {lead?.phone_type && <Field label="Line Type">{lead.phone_type}</Field>}
          {lead?.email && <Field label="Email">{lead.email}</Field>}
          {lead?.address && <Field label="Address">{lead.address}</Field>}
          {(lead?.city || lead?.zip) && (
            <Field label="Location">{[lead?.city, lead?.state, lead?.zip].filter(Boolean).join(", ")}</Field>
          )}
          {thread && <Field label="Last Contact">{relativeShort(thread.last_at)}</Field>}
          {property && (
            <div className="mt-2 pt-2 border-t">
              <SectionTitle icon={Home} title="Property" />
              {property.estimated_value && <Field label="Estimated Value">{property.estimated_value}</Field>}
              {property.owner_since && <Field label="Owner Since">{property.owner_since}</Field>}
              {property.sqft && <Field label="Square Feet">{property.sqft}</Field>}
              {property.beds && <Field label="Beds">{property.beds}</Field>}
              {property.tax_delinquent && <Field label="Tax Delinquent">{property.tax_delinquent}</Field>}
              {property.violations && <Field label="Code Violations">{property.violations}</Field>}
            </div>
          )}
        </RailSection>

        <RailSection icon={MessageSquare} title="Campaign">
          <Field label="Campaign">{ctx?.campaign?.name ?? "Not In A Campaign"}</Field>
          {ctx?.campaign && (
            <>
              <Field label="Touch">
                {ctx.campaign.touch} Of {Math.max(ctx.campaign.step_count, ctx.campaign.touch)}
              </Field>
              <Field label="Drip Sequence">
                <span className="capitalize">{ctx.campaign.status ?? "draft"}</span>
              </Field>
            </>
          )}
          {ctx?.brand && <Field label="Agent Voice">{ctx.brand.name}</Field>}
          {ctx?.job && (
            <Field label="Source List">
              {ctx.job.name || SOURCE_LABEL[ctx.job.source_type] || ctx.job.source_type}
            </Field>
          )}
          {ctx?.record && (
            <>
              <Field label="Lead Source">
                {ctx.record.source_types.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}
              </Field>
              <Field label="Appears On">
                {ctx.record.list_count} List{ctx.record.list_count === 1 ? "" : "s"}
              </Field>
              <Field label="Status">
                <span className="capitalize">{ctx.record.disposition.replace(/_/g, " ")}</span>
              </Field>
            </>
          )}
          {lead?.scrub_status && (
            <Field label="Scrub">
              <span className="capitalize">{lead.scrub_status}</span>
            </Field>
          )}
          {ctx?.suppressed && (
            <Badge variant="outline" className={cn("mt-1", TONE_CLASS.danger)}>
              Suppressed — Do Not Contact
            </Badge>
          )}
        </RailSection>

        <RailSection icon={Sparkles} title="Activity">
          <div className="flex flex-wrap gap-1 mb-3">
            {ctx?.tag && (
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: ctx.tag.color, color: ctx.tag.color }}>
                {ctx.tag.name}
              </Badge>
            )}
            {tags.length ? (
              tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))
            ) : ctx?.tag ? null : (
              <span className="text-xs text-muted-foreground">No Tags Yet.</span>
            )}
          </div>
          <AiTimeline events={events} />
          <div className="mt-3 pt-2 border-t">
          <SectionTitle icon={Copy} title="Notes" />
          <textarea
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Private notes about this lead…"
            className="w-full min-h-[72px] rounded-lg border bg-background p-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Saved On This Device.</p>
          </div>
        </RailSection>
      </div>
    </Card>
  );
}

/** Collapsible rail section — only expand what you need while replying. */
function RailSection({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="py-1">
      <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-1 py-2 cursor-pointer hover:bg-muted/40 rounded-md">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1 pb-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof UserRound; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
    </div>
  );
}

/** "AI composing…" style liveness indicator. */
export function AiActivityPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
      <Bot className="h-3 w-3" />
      {label}
      <span className="flex gap-0.5">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="h-1 w-1 rounded-full bg-success animate-bounce" style={{ animationDelay: delay }} />;
}
