import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ListChecks, Repeat, Megaphone, Rocket, PauseCircle, Wallet, Zap, Phone,
  Thermometer, BadgeCheck, Clock, Sparkles, ShieldCheck, Bot, Activity as ActivityIcon,
} from "lucide-react";
import { listActivity } from "@/lib/activity.functions";
import { ACTIVITY_ICON, activityLink, type ActivityEvent } from "@/lib/activity.shared";

const ICONS: Record<string, typeof ActivityIcon> = {
  list: ListChecks,
  repeat: Repeat,
  megaphone: Megaphone,
  rocket: Rocket,
  pause: PauseCircle,
  wallet: Wallet,
  zap: Zap,
  phone: Phone,
  thermometer: Thermometer,
  badge: BadgeCheck,
  clock: Clock,
  sparkles: Sparkles,
  shield: ShieldCheck,
  bot: Bot,
};

export function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins}m Ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h Ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d Ago`;
}

/** Shared data hook so the slide-out and the dashboard widget never drift. */
export function useActivity(workspaceId: string | null, group = "all", limit = 40) {
  const fetchActivity = useServerFn(listActivity);
  return useQuery({
    queryKey: ["activity", workspaceId, group, limit],
    queryFn: () => fetchActivity({ data: { workspaceId: workspaceId!, group, limit } }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });
}

export function ActivityRow({ event, onNavigate }: { event: ActivityEvent; onNavigate?: () => void }) {
  const Icon = ICONS[ACTIVITY_ICON[event.type] ?? ""] ?? ActivityIcon;
  const to = activityLink(event);
  const body = (
    <>
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{event.summary}</span>
        {event.detail && (
          <span className="block truncate text-xs text-muted-foreground">{event.detail}</span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
        {relativeTime(event.created_at)}
      </span>
    </>
  );

  if (!to) return <div className="flex items-start gap-3 px-4 py-3">{body}</div>;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted"
    >
      {body}
    </Link>
  );
}

export function ActivityList({
  events,
  onNavigate,
  empty = "Nothing Yet — Activity Shows Up As You Build Lists And Launch Campaigns.",
}: {
  events: ActivityEvent[];
  onNavigate?: () => void;
  empty?: string;
}) {
  if (!events.length) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {events.map((e) => (
        <li key={e.id}>
          <ActivityRow event={e} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}