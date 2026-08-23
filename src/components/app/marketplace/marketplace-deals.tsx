/**
 * MARKETPLACE DEALS feed — newly discovered listings that matched a saved
 * Marketplace Search, across every monitored marketplace in one feed.
 *
 * Truthfulness rules:
 *  - The score is a MATCH SCORE against the user's criteria, never a
 *    profitability estimate.
 *  - "Posted" only appears when the source gave a posting time we trust,
 *    otherwise "First Seen".
 *  - OPEN LISTING always leaves for the original marketplace; LeadTrace never
 *    presents itself as the marketplace.
 *  - No example listings are ever rendered — an empty feed says so.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Check, ExternalLink, EyeOff, Image as ImageIcon, Loader2, MapPin, Radar, Search,
  TriangleAlert, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  MARKETPLACE_CATEGORIES, MARKETPLACE_SOURCES, categoryLabel, criteriaLines, relativeTime,
  searchStatus, sourceLabel, type MarketplaceCategory,
} from "@/lib/marketplace/catalog.shared";
import {
  FRESHNESS_OPTIONS, MATCH_SCORE_OPTIONS, compsUrl, formatPrice, freshnessLabel, groupDeals,
  matchScoreTone, metaLine, agoLabel, type DealGroup, type MarketplaceListingRow,
} from "@/lib/marketplace/deals.shared";
import {
  dismissMarketplaceListing, listMarketplaceDeals, saveMarketplaceListingAsLead,
} from "@/lib/marketplace/marketplace.functions";
import type { MarketplaceSearchRow } from "@/lib/marketplace/searches.server";

export function MarketplaceDeals({
  workspaceId, searches, initialSearchId = null, onBack, onEditSearch,
}: {
  workspaceId: string | null;
  searches: MarketplaceSearchRow[];
  initialSearchId?: string | null;
  onBack: () => void;
  onEditSearch?: (row: MarketplaceSearchRow) => void;
}) {
  const load = useServerFn(listMarketplaceDeals);
  const dismiss = useServerFn(dismissMarketplaceListing);
  const saveLead = useServerFn(saveMarketplaceListingAsLead);

  const [searchId, setSearchId] = useState<string>(initialSearchId ?? "all");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [freshness, setFreshness] = useState(0);
  const [location, setLocation] = useState("");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DealGroup | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filters = {
    workspaceId: workspaceId ?? "",
    searchId: searchId === "all" ? null : searchId,
    category: category === "all" ? null : category,
    source: source === "all" ? null : source,
    minScore,
    freshnessHours: freshness,
    location: location.trim() || null,
    query: query.trim() || null,
  };

  const deals = useQuery({
    queryKey: ["marketplace-deals", filters],
    enabled: Boolean(workspaceId),
    queryFn: () => load({ data: filters }),
    refetchInterval: 60_000,
  });

  const groups = useMemo(
    () => groupDeals(deals.data?.listings ?? []),
    [deals.data?.listings],
  );

  const activeSearches = searches.filter((s) => s.status === "active");
  const selectedSearch = searches.find((s) => s.id === searchId) ?? null;

  async function onDismiss(row: MarketplaceListingRow) {
    if (!workspaceId) return;
    setBusyId(row.id);
    try {
      await dismiss({ data: { id: row.id, workspaceId, dismissed: true } });
      toast.success("Listing Dismissed");
      setDetail(null);
      await deals.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not dismiss this listing.");
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveLead(row: MarketplaceListingRow) {
    if (!workspaceId) return;
    setBusyId(row.id);
    try {
      await saveLead({ data: { id: row.id, workspaceId } });
      toast.success("Saved To Your Leads");
      await deals.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save this listing as a lead.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Marketplace Deals
          </h1>
          <p className="text-sm text-muted-foreground">
            New listings that match your Marketplace Searches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedSearch && onEditSearch && (
            <Button variant="ghost" size="sm" onClick={() => onEditSearch(selectedSearch)}>
              Edit Search
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Marketplace Searches
          </Button>
        </div>
      </div>

      {/* One compact filter row on desktop. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3 lg:flex-nowrap">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Listings"
              className="h-9 pl-8"
            />
          </div>
          <Select value={searchId} onValueChange={setSearchId}>
            <SelectTrigger className="h-9 w-[9.5rem] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Searches</SelectItem>
              {searches.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-[9rem] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {MARKETPLACE_CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-9 w-[9.5rem] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {MARKETPLACE_SOURCES.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(minScore)} onValueChange={(v) => setMinScore(Number(v))}>
            <SelectTrigger className="h-9 w-[10.5rem] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATCH_SCORE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-[8.5rem] shrink-0">
            <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              className="h-9 pl-8"
            />
          </div>
          <Select value={String(freshness)} onValueChange={(v) => setFreshness(Number(v))}>
            <SelectTrigger className="h-9 w-[9rem] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FRESHNESS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {deals.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Marketplace Deals…
          </CardContent>
        </Card>
      ) : deals.isError ? (
        <Card className="border-danger/30">
          <CardContent className="p-6 text-sm text-danger">
            {deals.error instanceof Error ? deals.error.message : "Could not load marketplace deals."}
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <DealsEmptyState searches={activeSearches} />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <DealCard
              key={group.listing.id}
              group={group}
              busy={busyId === group.listing.id}
              onOpenDetail={() => setDetail(group)}
              onDismiss={() => void onDismiss(group.listing)}
              onSaveLead={() => void onSaveLead(group.listing)}
            />
          ))}
        </div>
      )}

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {detail && (
            <DealDetail
              group={detail}
              searchName={searches.find((s) => s.id === detail.listing.searchId)?.name ?? null}
              busy={busyId === detail.listing.id}
              onDismiss={() => void onDismiss(detail.listing)}
              onSaveLead={() => void onSaveLead(detail.listing)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MatchScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${matchScoreTone(score)}`}
    >
      {score}% Match
    </span>
  );
}

function DealCard({
  group, busy, onOpenDetail, onDismiss, onSaveLead,
}: {
  group: DealGroup;
  busy: boolean;
  onOpenDetail: () => void;
  onDismiss: () => void;
  onSaveLead: () => void;
}) {
  const row = group.listing;
  const matched = row.matchBreakdown.filter((m) => m.ok);
  const mismatched = row.matchBreakdown.filter((m) => !m.ok);
  const meta = metaLine(row);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col gap-0 sm:flex-row">
          <button
            type="button"
            onClick={onOpenDetail}
            className="flex h-32 w-full shrink-0 items-center justify-center bg-surface-muted sm:h-auto sm:w-40"
            aria-label="Open Listing Detail"
          >
            {row.photos[0] ? (
              <img
                src={row.photos[0]}
                alt={row.title}
                loading="lazy"
                className="h-32 w-full object-cover sm:h-full"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <MatchScoreBadge score={row.matchScore} />
              <Badge variant="secondary">{sourceLabel(row.source)}</Badge>
              <span className="text-xs font-medium text-muted-foreground">
                {freshnessLabel(row)}
              </span>
              {row.savedAt && (
                <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                  Saved As Lead
                </Badge>
              )}
            </div>

            <button type="button" onClick={onOpenDetail} className="block text-left">
              <p className="text-base font-semibold text-foreground hover:underline">{row.title}</p>
            </button>
            <p className="text-lg font-semibold text-foreground">
              {formatPrice(row.price, row.currency)}
            </p>
            {meta && <p className="text-sm text-muted-foreground">{meta}</p>}

            {group.alsoListedOn.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Also Listed On: {group.alsoListedOn.map((d) => sourceLabel(d.source)).join(", ")}
              </p>
            )}

            {matched.length > 0 && (
              <div className="space-y-1 pt-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Matched
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {matched.map((m) => (
                    <span
                      key={m.label}
                      className="flex items-center gap-1 rounded-md border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                    >
                      <Check className="h-3 w-3" />
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {mismatched.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Potential Mismatch
                </p>
                {mismatched.map((m) => (
                  <p key={m.label} className="flex items-center gap-1 text-xs text-warn">
                    <TriangleAlert className="h-3 w-3 shrink-0" />
                    {m.note || m.label}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" variant="outline" asChild>
                <a href={compsUrl(row)} target="_blank" rel="noreferrer noopener">
                  Check Comps
                </a>
              </Button>
              <Button size="sm" asChild>
                <a href={row.listingUrl} target="_blank" rel="noreferrer noopener">
                  Open Listing
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onSaveLead}>
                <UserPlus className="mr-2 h-3.5 w-3.5" />
                Save As Lead
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
                <EyeOff className="mr-2 h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DealDetail({
  group, searchName, busy, onDismiss, onSaveLead,
}: {
  group: DealGroup;
  searchName: string | null;
  busy: boolean;
  onDismiss: () => void;
  onSaveLead: () => void;
}) {
  const row = group.listing;
  const sellerEntries = Object.entries(row.seller ?? {}).filter(
    ([, v]) => v !== null && v !== "" && v !== undefined,
  );
  const attributeEntries = Object.entries(row.attributes ?? {}).filter(
    ([, v]) => v !== null && v !== "" && v !== undefined,
  );

  return (
    <div className="space-y-4">
      <SheetHeader className="space-y-2 p-0 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <MatchScoreBadge score={row.matchScore} />
          <Badge variant="secondary">{sourceLabel(row.source)}</Badge>
          {row.category && <Badge variant="secondary">{categoryLabel(row.category)}</Badge>}
        </div>
        <SheetTitle className="text-lg">{row.title}</SheetTitle>
        <p className="text-lg font-semibold text-foreground">
          {formatPrice(row.price, row.currency)}
        </p>
        {metaLine(row) && <p className="text-sm text-muted-foreground">{metaLine(row)}</p>}
      </SheetHeader>

      {row.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {row.photos.slice(0, 8).map((p) => (
            <img
              key={p}
              src={p}
              alt={row.title}
              loading="lazy"
              className="h-28 w-40 shrink-0 rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" asChild>
          <a href={row.listingUrl} target="_blank" rel="noreferrer noopener">
            Open Listing
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </a>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={compsUrl(row)} target="_blank" rel="noreferrer noopener">
            Check Comps
          </a>
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onSaveLead}>
          Save As Lead
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      {row.description && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{row.description}</p>
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Criteria Match Breakdown{searchName ? ` · ${searchName}` : ""}
        </p>
        {row.matchBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No criteria breakdown was recorded for this listing.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {row.matchBreakdown.map((m) => (
              <li key={m.label} className="flex items-start gap-2 text-sm">
                {m.ok ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                )}
                <span className={m.ok ? "text-foreground" : "text-warn"}>
                  {m.label}
                  {m.note ? ` — ${m.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {attributeEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Extracted Attributes
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {attributeEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </dt>
                <dd className="text-right font-medium text-foreground">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Seller Information From Source
        </p>
        {sellerEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The source did not provide seller details. Contact the seller through the original
            listing.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {sellerEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </dt>
                <dd className="text-right font-medium text-foreground">{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Source: {sourceLabel(row.source)}</p>
        <p>First Seen: {agoLabel(row.firstSeenAt)}</p>
        <p>
          Source Posted Time:{" "}
          {row.postedAt && row.postedAtReliable
            ? agoLabel(row.postedAt)
            : "Not Provided By Source"}
        </p>
        {group.alsoListedOn.length > 0 && (
          <p className="flex flex-wrap items-center gap-2">
            Also Listed On:
            {group.alsoListedOn.map((d) => (
              <a
                key={d.listingUrl}
                href={d.listingUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-accent hover:underline"
              >
                {sourceLabel(d.source)}
              </a>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

function DealsEmptyState({ searches }: { searches: MarketplaceSearchRow[] }) {
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-5 px-6 py-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <Radar className="h-6 w-6 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">No New Matches Yet.</p>
          <p className="max-w-xl text-sm text-muted-foreground">
            LeadTrace is monitoring your active Marketplace Searches. New qualifying listings will
            appear here.
          </p>
        </div>

        {searches.length > 0 && (
          <div className="mx-auto max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active Marketplace Searches
            </p>
            {searches.map((s) => {
              const status = searchStatus(s);
              const lines = criteriaLines(s.category as MarketplaceCategory, s.criteria);
              return (
                <div
                  key={s.id}
                  className="rounded-md border border-border bg-surface-muted px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Last Checked: {relativeTime(s.lastCheckedAt)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {categoryLabel(s.category)}
                    {s.sources.length ? ` · ${s.sources.map(sourceLabel).join(", ")}` : ""}
                    {lines.length ? ` · ${lines.slice(0, 3).join(" · ")}` : ""}
                  </p>
                  {status.detail && (
                    <p className="pt-0.5 text-xs text-muted-foreground">{status.detail}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
