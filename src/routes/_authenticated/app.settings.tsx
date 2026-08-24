import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/lib/workspace-settings.functions";
import {
  Building2, Home, Sun, Shield, Wrench, Briefcase, MoreHorizontal, Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsShell } from "@/components/app/settings-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useReferenceData } from "@/hooks/use-reference-data";
import { useWorkspaceId } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Workspace Settings — LeadTrace" }] }),
  component: Settings,
});

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  insurance: Shield,
  real_estate: Home,
  solar: Sun,
  home_services: Wrench,
  agency: Briefcase,
  other: MoreHorizontal,
};

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
];

const STATES = ["FL", "TX", "GA", "NC", "AZ", "CA", "OH", "PA"];

function Settings() {
  const { workspaceId, workspaceName } = useWorkspaceId();
  const { industries } = useReferenceData();
  const qc = useQueryClient();
  const loadSettings = useServerFn(getWorkspaceSettings);
  const saveSettings = useServerFn(updateWorkspaceSettings);

  const settingsQ = useQuery({
    queryKey: ["workspace-settings", workspaceId],
    queryFn: () => loadSettings({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("real_estate");
  const [timezone, setTimezone] = useState("America/New_York");
  const [state, setState] = useState("FL");

  // Hydrate the form from the saved record; without this the page always shows
  // defaults and "Save Changes" would overwrite real settings with them.
  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setName(s.name);
    setIndustry(s.industry);
    setTimezone(s.timezone);
    setState(s.defaultState);
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          workspaceId: workspaceId!,
          name: name.trim() || (workspaceName ?? "Workspace"),
          industry,
          timezone,
          defaultState: state,
        },
      }),
    onSuccess: () => {
      toast.success("Workspace Settings Saved");
      qc.invalidateQueries({ queryKey: ["workspace-settings", workspaceId] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (e: unknown) =>
      toast.error((e as Error).message || "Could Not Save Workspace Settings"),
  });


  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current="workspace">
      <PageHeader title="Workspace Settings" description="General Details And Industry Preset For This Workspace." />

      <div className="max-w-3xl space-y-6">
          {/* General */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Building2 className="h-4 w-4 text-primary" /> General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="ws-name">Workspace Name</Label>
                  <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t.replace("America/", "").replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Default State</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Industry Preset</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tunes Templates, Message Tone, And Default Filters Across The Workspace.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {industries.map((i) => {
                    const Icon = INDUSTRY_ICONS[i.slug] ?? MoreHorizontal;
                    const active = industry === i.slug;
                    return (
                      <button
                        key={i.slug}
                        type="button"
                        onClick={() => setIndustry(i.slug)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          active
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border bg-surface hover:border-primary/40"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="mt-2 text-sm font-semibold text-foreground">{i.name}</div>
                        <div className="mt-1 h-4 text-[11px] font-semibold uppercase tracking-wider text-primary">
                          {active && (
                            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Selected</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                className="rounded-full"
                disabled={!workspaceId || settingsQ.isLoading || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

      </div>
      </SettingsShell>
    </div>
  );
}
