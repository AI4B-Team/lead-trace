/**
 * COMPARABLE LISTINGS drawer.
 *
 * Everything shown here is backed by actual comparable listings. Rules the UI
 * enforces:
 *  - "Market Difference", never Profit / Expected Profit — LeadTrace does not
 *    know intent, repairs, fees, taxes or transport.
 *  - Asking comps and Sold comps are labelled separately and never blended.
 *  - Without enough reliable comps we say so and still show what we found.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, ScaleIcon, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/marketplace/catalog.shared";
import {
  COMPS_CONFIDENCE_LABEL, COMP_BASIS_LABEL, compSubjectLine, marketDifferenceLabel, rangeLabel,
  type Comp, type CompsSummary, type CompSubject,
} from "@/lib/marketplace/comps.shared";
import { getMarketplaceComps } from "@/lib/marketplace/marketplace.functions";
import type { MarketplaceListingRow } from "@/lib/marketplace/deals.shared";

type CompsPayload = {
  subject: CompSubject;
  summary: CompsSummary;
  comps: Comp[];
  compSources: { key: string; label: string; status: "live" | "planned"; note: string }[];
  computedAt: string;
  cached: boolean;
};

export function CompsDrawer({
  listing, workspaceId, open, onOpenChange,
}: {
  listing: MarketplaceListingRow | null;
  workspaceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useServerFn(getMarketplaceComps);
  const [refreshing, setRefreshing] = useState(false);

  const comps = useQuery({
    queryKey: ["marketplace-comps", listing?.id, workspaceId],
    enabled: open && Boolean(listing?.id && workspaceId),
    queryFn: () =>
      run({ data: { id: listing!.id, workspaceId: workspaceId!, refresh: false } }) as Promise<CompsPayload>,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!open) setRefreshing(false);
  }, [open]);

  async function onRefresh() {
    if (!listing || !workspaceId) return;
    setRefreshing(true);
    try {
      await run({ data: { id: listing.id, workspaceId, refresh: true } });
      await comps.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const data = comps.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="space-y-2 p-0 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ScaleIcon className="h-4 w-4" />
            Comparable Listings
          </SheetTitle>
          {listing && (
            <div className="space-y-0.5">
              <p className="text-base font-semibold text-foreground">{listing.title}</p>
              <p className="text-sm text-muted-foreground">
                {(data
                  ? compSubjectLine(data.subject)
                  : compSubjectLine({
                      title: listing.title,
                      price: listing.price,
                      category: (listing.category ?? "other") as CompSubject["category"],
                      locationText: listing.locationText,
                      distanceMiles: listing.distanceMiles,
                      attributes: listing.attributes,
                      radiusMiles: null,
                    })
                ).join(" · ")}
              </p>
            </div>
          )}
        </SheetHeader>

        <div className="space-y-4 pt-4">
          {comps.isPending && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Gathering Comparable Listings…
            </div>
          )}

          {comps.isError && (
            <p className="text-sm text-destructive">
              {comps.error instanceof Error
                ? comps.error.message
                : "Could not gather comparable listings."}
            </p>
          )}

          {data && (
            <>
              {data.summary.status === "sufficient" ? (
                <CompsSummaryPanel summary={data.summary} />
              ) : (
                <InsufficientPanel summary={data.summary} />
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void onRefresh()}>
                  {refreshing ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Refresh Comps
                </Button>
                <span className="text-xs text-muted-foreground">
                  {data.cached ? "Reused Cached Comp Search" : "Freshly Gathered"} ·{" "}
                  {new Date(data.computedAt).toLocaleString("en-US")}
                </span>
              </div>

              <Separator />
              <CompList comps={data.comps} />
              <Separator />
              <CompSourcesPanel sources={data.compSources} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function CompsSummaryPanel({ summary }: { summary: CompsSummary }) {
  const difference = marketDifferenceLabel(summary);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <SummaryStat label="Comparable Range" value={rangeLabel(summary)} />
        <SummaryStat
          label="Median Asking"
          value={summary.median == null ? "Not Available" : formatMoney(summary.median)}
        />
        <SummaryStat
          label="Subject Asking"
          value={summary.subjectPrice == null ? "Not Listed" : formatMoney(summary.subjectPrice)}
        />
        <SummaryStat
          label="Market Difference"
          value={difference ?? "Subject Price Not Listed"}
          tone={
            summary.direction === "below"
              ? "text-success"
              : summary.direction === "above"
                ? "text-destructive"
                : "text-foreground"
          }
        />
        <SummaryStat label="Comps Found" value={String(summary.compsFound)} />
        <SummaryStat label="Confidence" value={COMPS_CONFIDENCE_LABEL[summary.confidence]} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {summary.basis && <Badge variant="secondary">Range From {COMP_BASIS_LABEL[summary.basis]}</Badge>}
        <Badge variant="outline">Active Asking Comps: {summary.askingCount}</Badge>
        <Badge variant="outline">Sold Comps: {summary.soldCount}</Badge>
        <Badge variant="outline">Usable Comps: {summary.usableCount}</Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Market Difference compares the asking price to comparable listings only. It is not profit —
        it excludes repairs, fees, taxes, transport and your own intent.
      </p>

      <ConfidenceFactors summary={summary} />
    </div>
  );
}

function ConfidenceFactors({ summary }: { summary: CompsSummary }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Why Confidence Is {COMPS_CONFIDENCE_LABEL[summary.confidence]}
      </p>
      <ul className="space-y-0.5">
        {summary.confidenceFactors.map((f) => (
          <li key={f.label} className="flex items-baseline gap-2 text-xs">
            <span
              className={
                f.state === "strong"
                  ? "text-success"
                  : f.state === "fair"
                    ? "text-warning"
                    : "text-muted-foreground"
              }
            >
              ●
            </span>
            <span className="font-medium text-foreground">{f.label}:</span>
            <span className="text-muted-foreground">{f.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsufficientPanel({ summary }: { summary: CompsSummary }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TriangleAlert className="h-4 w-4" />
          Not Enough Reliable Comps
        </p>
        <p className="pt-1 text-sm text-muted-foreground">
          We couldn't find enough similar listings to estimate a trustworthy market range.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Comps Found: {summary.compsFound}</Badge>
        <Badge variant="outline">Usable Comps: {summary.usableCount}</Badge>
        <Badge variant="outline">
          Subject Asking:{" "}
          {summary.subjectPrice == null ? "Not Listed" : formatMoney(summary.subjectPrice)}
        </Badge>
      </div>
      <ConfidenceFactors summary={summary} />
    </div>
  );
}

function CompList({ comps }: { comps: Comp[] }) {
  const usable = comps.filter((c) => c.usable);
  const rest = comps.filter((c) => !c.usable);
  if (!comps.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No comparable listings were returned by the available comp sources.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {usable.length > 0 && (
        <CompSection title={`Comparable Listings Used (${usable.length})`} comps={usable} />
      )}
      {rest.length > 0 && (
        <CompSection
          title={`Found But Not Used (${rest.length})`}
          comps={rest}
          note="These were too different to back a market range. Shown so you can inspect them."
        />
      )}
    </div>
  );
}

function CompSection({ title, comps, note }: { title: string; comps: Comp[]; note?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="space-y-2">
        {comps.map((c) => (
          <CompRow key={c.id} comp={c} />
        ))}
      </div>
    </div>
  );
}

function CompRow({ comp }: { comp: Comp }) {
  const notes = comp.similarityNotes.filter((n) => n.state !== "unknown").slice(0, 5);
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{comp.title}</p>
          <p className="text-xs text-muted-foreground">
            {[
              comp.locationText,
              comp.distanceMiles == null
                ? null
                : `${Math.round(comp.distanceMiles).toLocaleString("en-US")} Miles Away`,
              comp.sourceLabel,
              comp.priceKind === "sold" ? "Sold Price" : "Asking Price",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground">{formatMoney(comp.price)}</p>
          <p className="text-xs text-muted-foreground">Similarity: {comp.similarity}%</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1">
        {notes.map((n) => (
          <span
            key={n.key}
            className={`text-xs ${n.state === "differs" ? "text-muted-foreground" : "text-foreground"}`}
          >
            {n.label}
            {n.detail ? `: ${n.detail}` : ""}
          </span>
        ))}
      </div>

      {comp.unusableReason && (
        <p className="pt-1 text-xs text-muted-foreground">Not Used: {comp.unusableReason}</p>
      )}

      {comp.listingUrl && (
        <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" asChild>
          <a href={comp.listingUrl} target="_blank" rel="noreferrer noopener">
            View Comp
            <ExternalLink className="ml-1.5 h-3 w-3" />
          </a>
        </Button>
      )}
    </div>
  );
}

/**
 * Comp Sources are shown separately from Marketplace Sources on purpose:
 * where we hunt for the item and what we value it against are different things.
 */
function CompSourcesPanel({
  sources,
}: {
  sources: { key: string; label: string; status: "live" | "planned"; note: string }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Comp Sources
      </p>
      {sources.map((s) => (
        <div key={s.key} className="flex flex-wrap items-baseline gap-2 text-xs">
          <span className="font-medium text-foreground">{s.label}</span>
          <Badge variant={s.status === "live" ? "secondary" : "outline"}>
            {s.status === "live" ? "Live" : "Planned"}
          </Badge>
          <span className="text-muted-foreground">{s.note}</span>
        </div>
      ))}
    </div>
  );
}
