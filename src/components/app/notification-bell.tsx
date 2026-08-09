import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Inbox, MessageSquare, Repeat, Rocket, AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { listThreads } from "@/lib/inbox.functions";
import { listNotifications, markNotificationsRead } from "@/lib/jobs.functions";

const RUN_ICON: Record<string, typeof Repeat> = {
  run_complete: Repeat,
  run_auto_launched: Rocket,
  run_no_new: CheckCircle2,
  run_failed: AlertTriangle,
  credits_low_scrape: Wallet,
  credits_low_skip_trace: Wallet,
  credits_low_sms: Wallet,
  credits_refunded: Wallet,
};

function relative(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins}m Ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h Ago`;
  return `${Math.round(mins / 1440)}d Ago`;
}

// Bell surfaces two things that need the user: unread inbound replies, and
// recurring runs that landed while they were away.
export function NotificationBell() {
  const { workspaceId } = useWorkspaceId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const fetchThreads = useServerFn(listThreads);
  const fetchRuns = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);

  const { data } = useQuery({
    queryKey: ["notifications-unread", workspaceId],
    queryFn: () => fetchThreads({ data: { workspaceId: workspaceId!, filter: "unread" } }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const { data: runData } = useQuery({
    queryKey: ["run-notifications", workspaceId],
    queryFn: () => fetchRuns({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const threads = (data?.threads ?? []).slice(0, 4);
  const runs = (runData?.rows ?? []).slice(0, 6);
  const count = (data?.threads?.length ?? 0) + (runData?.unread ?? 0);

  return (
    <Popover
      open={open}
      onOpenChange={async (next) => {
        setOpen(next);
        if (!next && workspaceId && (runData?.unread ?? 0) > 0) {
          await markRead({ data: { workspaceId } });
          qc.invalidateQueries({ queryKey: ["run-notifications", workspaceId] });
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 bg-background border shadow-xl z-50">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold">Notifications</p>
          <span className="text-xs text-muted-foreground">{count} Unread</span>
        </div>

        {threads.length === 0 && runs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Inbox className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">You're All Caught Up</p>
          </div>
        ) : (
          <ul className="max-h-96 overflow-auto divide-y divide-border">
            {runs.map((n) => {
              const Icon = RUN_ICON[n.kind] ?? Repeat;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      if (n.job_id) {
                        navigate({ to: "/app/lists/$listId", params: { listId: n.job_id } });
                      } else {
                        navigate({ to: "/app/lists" });
                      }
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors flex gap-3 ${
                      n.read_at ? "" : "bg-primary/5"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        n.kind === "run_failed" ? "text-danger" : "text-primary"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      <span className="block text-xs text-muted-foreground">{n.body ?? ""}</span>
                      <span className="block text-[11px] text-muted-foreground/70">
                        {relative(n.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {threads.map((t) => (
              <li key={t.thread_key}>
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: "/app/inbox" });
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-muted transition-colors flex gap-3"
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {t.lead?.full_name || t.lead?.phone || "New Reply"}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">{t.last_body ?? ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border p-3">
          <Button asChild variant="outline" size="sm" className="w-full rounded-full">
            <Link to="/app/inbox" onClick={() => setOpen(false)}>Open Conversations</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
