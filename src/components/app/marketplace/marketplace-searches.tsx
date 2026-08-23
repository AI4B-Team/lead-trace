/**
 * Marketplace Searches — saved-search management inside the Marketplace Deals
 * template experience. No new navigation item: this list is reached from the
 * template card and from contextual links on existing lead surfaces.
 *
 * Truthfulness rule: status comes from `searchStatus()`, which refuses to say
 * "Active" while no marketplace adapter is actually running.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Copy, Loader2, MapPin, MoreHorizontal, Pause, Pencil, Play, Plus, Radar, Search, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  categoryLabel, criteriaLines, relativeTime, sourceLabel,
  type MarketplaceCategory,
} from "@/lib/marketplace/catalog.shared";
import { monitorHealth, intervalLabel, POLL_TIERS, type MonitorHealth } from "@/lib/marketplace/monitor.shared";
import {
  deleteMarketplaceSearch, duplicateMarketplaceSearch, updateMarketplaceSearch,
} from "@/lib/marketplace/marketplace.functions";
import type { MarketplaceSearchRow } from "@/lib/marketplace/searches.server";

const TONE: Record<MonitorHealth["tone"], string> = {
  success: "bg-success/10 text-success border-success/20",
  muted: "bg-surface-muted text-muted-foreground border-border",
  warn: "bg-warn/10 text-warn border-warn/20",
  danger: "bg-danger/10 text-danger border-danger/20",
};

export function StatusBadge({ status }: { status: MonitorHealth }) {
  return (
    <Badge variant="outline" className={`${TONE[status.tone]} uppercase tracking-wide`}>
      {status.label}
    </Badge>
  );
}

export function MarketplaceSearchList({
  rows, loading, workspaceId, onCreate, onEdit, onViewResults, onChanged,
}: {
  rows: MarketplaceSearchRow[];
  loading: boolean;
  workspaceId: string | null;
  onCreate: () => void;
  onEdit: (row: MarketplaceSearchRow) => void;
  onViewResults: (row: MarketplaceSearchRow) => void;
  onChanged: () => void;
}) {
  const update = useServerFn(updateMarketplaceSearch);
  const duplicate = useServerFn(duplicateMarketplaceSearch);
  const remove = useServerFn(deleteMarketplaceSearch);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (row: MarketplaceSearchRow) =>
      update({
        data: {
          id: row.id,
          workspaceId: workspaceId!,
          status: row.status === "paused" ? "active" : "paused",
        },
      }),
    onMutate: (row) => setPendingId(row.id),
    onSuccess: (_r, row) => {
      toast.success(row.status === "paused" ? "Search Resumed" : "Search Paused");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update this search."),
    onSettled: () => setPendingId(null),
  });

  const copy = useMutation({
    mutationFn: (row: MarketplaceSearchRow) =>
      duplicate({ data: { id: row.id, workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Search Duplicated");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not duplicate this search."),
  });

  const del = useMutation({
    mutationFn: (row: MarketplaceSearchRow) =>
      remove({ data: { id: row.id, workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Search Deleted");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete this search."),
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Your Marketplace Searches…
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) return <EmptyState onCreate={onCreate} />;

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const status = monitorHealth(row);
        const lines = criteriaLines(row.category as MarketplaceCategory, row.criteria);
        const busy = pendingId === row.id;
        return (
          <Card key={row.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-semibold text-foreground">{row.name}</p>
                    <StatusBadge status={status} />
                    <Badge variant="secondary">{categoryLabel(row.category)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {row.sources.length ? row.sources.map(sourceLabel).join(" · ") : "No Marketplaces Selected"}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {row.location ? `${row.location} · ` : ""}
                    {row.radiusMiles == null ? "Nationwide" : `Within ${row.radiusMiles.toLocaleString("en-US")} Miles`}
                  </p>
                  {lines.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {lines.map((l) => (
                        <span
                          key={l}
                          className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                  {status.detail && (
                    <p className="text-xs text-muted-foreground">{status.detail}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Last Checked: {relativeTime(row.lastCheckedAt)}</p>
                    <p className="text-sm font-semibold text-foreground">
                      {row.matchesFound.toLocaleString("en-US")} {row.matchesFound === 1 ? "Match" : "Matches"}
                    </p>
                    <p>
                      Alerts:{" "}
                      {row.notifyInApp || row.notifyEmail
                        ? [row.notifyInApp ? "In-App" : null, row.notifyEmail ? "Email" : null]
                            .filter(Boolean)
                            .join(" + ")
                        : "Off"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => onViewResults(row)}>
                      View Results
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onEdit(row)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !workspaceId}
                      onClick={() => toggle.mutate(row)}
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : row.status === "paused" ? (
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {row.status === "paused" ? "Resume" : "Pause"}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label={`More actions for ${row.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={!workspaceId} onClick={() => copy.mutate(row)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!workspaceId}
                          className="text-danger focus:text-danger"
                          onClick={() => del.mutate(row)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Button variant="outline" onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" />
        Create Marketplace Search
      </Button>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="rounded-full border border-border bg-surface-muted p-3">
          <Radar className="h-6 w-6 text-primary" />
        </span>
        <p className="text-lg font-semibold text-foreground">Find it before everyone else.</p>
        <p className="max-w-xl text-sm text-muted-foreground">
          Create a Marketplace Search and Lead Trace will monitor available sources for new listings
          that match your criteria.
        </p>
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Marketplace Search
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Results surface for one search. Matches land here once a source adapter runs;
 * until then this states plainly that nothing has been collected.
 */
export function MarketplaceSearchResults({
  row, onBack, onEdit,
}: {
  row: MarketplaceSearchRow;
  onBack: () => void;
  onEdit: () => void;
}) {
  const status = monitorHealth(row);
  const lines = criteriaLines(row.category as MarketplaceCategory, row.criteria);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <Badge variant="secondary">{categoryLabel(row.category)}</Badge>
            {row.sources.map((s) => (
              <Badge key={s} variant="secondary">{sourceLabel(s)}</Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {row.location ? `${row.location} · ` : ""}
            {row.radiusMiles == null ? "Nationwide" : `Within ${row.radiusMiles.toLocaleString("en-US")} Miles`} · Last
            Checked: {relativeTime(row.lastCheckedAt)}
          </p>
          {lines.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lines.map((l) => (
                <span
                  key={l}
                  className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              All Marketplace Searches
            </Button>
            <Button variant="ghost" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Search className="h-6 w-6 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">No Matches Yet</p>
          <p className="max-w-xl text-sm text-muted-foreground">
            {status.key === "source_unavailable"
              ? "No marketplace connection is live yet, so no listings have been collected for this search. Matches will appear here — and flow into your leads — as soon as a source is connected."
              : "Nothing has matched this search yet. New listings appear here as soon as they are found."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
