import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ListChecks, MessageSquare, CreditCard, Users, Mail, Bell, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Delivery channels a notification can eventually go out on. Only email is wired today. */
export const CHANNELS = [
  { key: "email", label: "Email", icon: Mail, live: true },
  { key: "inApp", label: "In-App", icon: Bell, live: false },
  { key: "sms", label: "SMS", icon: Smartphone, live: false },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]["key"];
export type ChannelPrefs = Partial<Record<ChannelKey, boolean>>;
export type NotifyPrefs = Record<string, ChannelPrefs>;

type ItemDef = { key: string; label: string; hint: string; legacy?: string; soon?: boolean };
type GroupDef = { label: string; icon: LucideIcon; items: ItemDef[]; soon?: boolean };

export const NOTIFY_GROUPS: GroupDef[] = [
  {
    label: "Lists & Pipeline",
    icon: ListChecks,
    items: [
      {
        key: "jobComplete",
        label: "List Complete",
        hint: "Tell Me When A List Finishes Cleaning And Is Ready To Use.",
        legacy: "jobComplete",
      },
      {
        key: "listFailed",
        label: "Run Problems",
        hint: "A Recurring Run Failed Or Returned No New Leads.",
      },
    ],
  },
  {
    label: "Campaigns & Replies",
    icon: MessageSquare,
    items: [
      {
        key: "campaignAlerts",
        label: "Campaign Alerts",
        hint: "Replies, Opt-Outs, And Number Health Warnings.",
        legacy: "campaignAlerts",
      },
      {
        key: "agentHandoff",
        label: "AI Agent Handoffs",
        hint: "The Agent Passed A Conversation Back To A Human.",
      },
    ],
  },
  {
    label: "Billing & Credits",
    icon: CreditCard,
    items: [
      {
        key: "billingEmails",
        label: "Billing Emails",
        hint: "Receipts, Credit Top-Ups, And Low-Balance Warnings.",
        legacy: "billingEmails",
      },
    ],
  },
  {
    label: "Team & Compliance",
    icon: Users,
    items: [
      {
        key: "approvals",
        label: "Spend Approvals",
        hint: "A Teammate Requested Approval For A High-Spend Action.",
      },
      {
        key: "complianceEvents",
        label: "Compliance Events",
        hint: "Daily Digest Of DNC Hits, Blocked Sends, And Quiet-Hours Blocks.",
      },
    ],
  },
];

const DEFAULT_ON = new Set(["jobComplete", "campaignAlerts", "billingEmails", "approvals"]);

/** Normalizes stored prefs (legacy booleans or channel maps) into the channel model. */
export function normalizePrefs(stored: unknown): NotifyPrefs {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const out: NotifyPrefs = {};
  for (const group of NOTIFY_GROUPS) {
    for (const item of group.items) {
      const value = raw[item.key];
      if (typeof value === "boolean") {
        out[item.key] = { email: value };
      } else if (value && typeof value === "object") {
        out[item.key] = value as ChannelPrefs;
      } else {
        out[item.key] = { email: DEFAULT_ON.has(item.key) };
      }
    }
  }
  return out;
}

/** Grouped notification matrix — one row per event, one toggle per delivery channel. */
export function NotificationPrefs({
  prefs,
  onChange,
}: {
  prefs: NotifyPrefs;
  onChange: (next: NotifyPrefs) => void;
}) {
  const set = (itemKey: string, channel: ChannelKey, value: boolean) => {
    onChange({ ...prefs, [itemKey]: { ...(prefs[itemKey] ?? {}), [channel]: value } });
  };

  return (
    <div className="space-y-6">
      {NOTIFY_GROUPS.map((group) => {
        const GroupIcon = group.icon;
        return (
          <Card key={group.label}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <GroupIcon className="h-4 w-4 text-muted-foreground" /> {group.label}
                {group.soon && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Coming Soon
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="hidden items-center justify-end gap-6 pb-2 pr-1 sm:flex">
                {CHANNELS.map((c) => (
                  <span
                    key={c.key}
                    className="w-14 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    {c.label}
                  </span>
                ))}
              </div>
              <div className="divide-y">
                {group.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.hint}</div>
                    </div>
                    <div className="flex items-center justify-end gap-6">
                      {CHANNELS.map((c) => {
                        const disabled = !c.live || group.soon || item.soon;
                        const control = (
                          <div className="flex w-14 justify-center">
                            <Switch
                              aria-label={`${item.label} via ${c.label}`}
                              disabled={disabled}
                              checked={!disabled && !!prefs[item.key]?.[c.key]}
                              onCheckedChange={(v) => set(item.key, c.key, v)}
                            />
                          </div>
                        );
                        if (!disabled) return <div key={c.key}>{control}</div>;
                        return (
                          <Tooltip key={c.key}>
                            <TooltipTrigger asChild>
                              <span className="cursor-not-allowed opacity-50">{control}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {group.soon || item.soon
                                ? "This Notification Is Coming Soon."
                                : `${c.label} Delivery Is Coming Soon.`}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        These Settings Control What Gets Sent To You. In-App Badges And The Activity Feed Always Reflect Live Account
        Events.
      </p>
    </div>
  );
}
