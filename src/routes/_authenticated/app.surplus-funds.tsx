import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { exportSurplusRecords, listSurplusRecords } from "@/lib/surplus/feed.functions";
import { surplusFiltersSchema, type SurplusFilters } from "@/lib/surplus/feed.schema";
import { ConfidenceBadge, EscheatCountdown } from "@/components/app/surplus/indicators";
import { SurplusFilterBar } from "@/components/app/surplus/surplus-filter-bar";
import { SurplusDetailPanel } from "@/components/app/surplus/surplus-detail-panel";
import {
  currency,
  formatFeedDate,
  SALE_TYPE_LABELS,
  SORT_OPTIONS,
  type SurplusFeedRecord,
} from "@/lib/surplus/feed.shared";

export const Route = createFileRoute("/_authenticated/app/surplus-funds")({
  head: () => ({
    meta: [
      { title: "Surplus Funds — LeadTrace" },
      {
        name: "description",
        content:
          "Excess proceeds held by county clerks after tax deed and foreclosure sales. Sort by claim deadline or newest sale.",
      },
      { property: "og:title", content: "Surplus Funds — LeadTrace" },
      {
        property: "og:description",
        content: "Clerk-confirmed and derived surplus records with escheat countdowns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SurplusFundsFeed,
});

const EMPTY_FILTERS: SurplusFilters = surplusFiltersSchema.parse({});

function SurplusFundsFeed() {
  const { workspaceId } = useWorkspaceId();
  const [filters, setFiltersState] = useState<SurplusFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<SurplusFeedRecord | null>(null);

  const fetchRecords = useServerFn(listSurplusRecords);
  const runExport = useServerFn(exportSurplusRecords);

  const scoped = useMemo<SurplusFilters>(
    () => ({ ...filters, workspaceId: workspaceId ?? null }),
    [filters, workspaceId],
  );

  const query = useQuery({
    queryKey: ["surplus", "records", scoped],
    queryFn: () => fetchRecords({ data: scoped }),
    placeholderData: keepPreviousData,
  });

  const exportCsv = useMutation({
    mutationFn: () => runExport({ data: scoped }),
    onSuccess: ({ csv, filename, rowCount, truncated }) => {
      downloadCsv(csv, filename);
      toast.success(
        truncated
          ? `Exported the first ${rowCount.toLocaleString()} rows. Narrow the filters to export the rest.`
          : `Exported ${rowCount.toLocaleString()} records.`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function setFilters(next: Partial<SurplusFilters>) {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }

  const isFiltered =
    JSON.stringify({ ...filters, page: 1, workspaceId: null }) !== JSON.stringify(EMPTY_FILTERS);
  const records = query.data?.records ?? [];
  const total = query.data?.total ?? 0;
  const pageSize = filters.pageSize;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            title="Surplus Funds"
            description="Excess proceeds held by county clerks after tax deed and foreclosure sales. Sort by claim deadline or newest sale."
          />
          <Button
            variant="outline"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending || total === 0}
          >
            {exportCsv.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden />
            )}
            Export CSV
          </Button>
        </div>

        <SurplusFilterBar
          filters={filters}
          onChange={setFilters}
          onReset={() => setFiltersState(EMPTY_FILTERS)}
          isFiltered={isFiltered}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm tabular-nums text-muted-foreground">
            {query.isLoading ? "Loading…" : `${total.toLocaleString()} Records`}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort</span>
            <div className="inline-flex rounded-md border border-border p-0.5">
              {SORT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={filters.sort === option.value ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs"
                  aria-pressed={filters.sort === option.value}
                  onClick={() => setFilters({ sort: option.value, page: 1 })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Case</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="w-40">County</TableHead>
                <TableHead className="w-48">Owner Of Record</TableHead>
                <TableHead className="w-32 text-right">Surplus</TableHead>
                <TableHead className="w-44">Sale Type</TableHead>
                <TableHead className="w-28">Sale Date</TableHead>
                <TableHead className="w-28">Escheat</TableHead>
                <TableHead className="w-36">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <LoadingRows />
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40 text-center align-middle">
                    <p className="font-medium">No Surplus Records Match These Filters.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Widen the amount range or the sale dates, or clear the filters to see
                      everything in your published states.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow
                    key={record.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => setSelected(record)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(record);
                      }
                    }}
                    className="cursor-pointer focus-visible:bg-surface-muted focus-visible:outline-none [&_td]:py-2"
                  >
                    <TableCell className="font-mono text-xs">{record.case_number ?? "—"}</TableCell>
                    <TableCell className="max-w-[12rem]">
                      {record.property_address ? (
                        <span className="block truncate">{record.property_address}</span>
                      ) : [record.property_city, record.property_zip]
                          .filter(Boolean)
                          .join(", ") ? (
                        <span className="block truncate">
                          {[record.property_city, record.property_zip]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">
                          Not in clerk list
                        </span>
                      )}
                      {record.parcel_id ? (
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {record.parcel_id}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {record.county_name ?? "—"}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {record.state_code}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      {record.owner_of_record ? (
                        <span className="block truncate">{record.owner_of_record}</span>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">
                          Not in clerk list
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {currency.format(record.surplus_amount)}
                    </TableCell>
                    <TableCell>{SALE_TYPE_LABELS[record.sale_type] ?? record.sale_type}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatFeedDate(record.sale_date)}
                    </TableCell>
                    <TableCell>
                      <EscheatCountdown
                        days={record.days_to_escheat}
                        escheatDate={record.escheat_date}
                        destination={record.escheat_destination}
                        disbursementStatus={record.disbursement_status}
                      />
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge
                        confidence={record.confidence}
                        sourceUrl={record.source_url}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {total > pageSize ? (
          <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
            <span className="tabular-nums text-muted-foreground">
              Page {filters.page} of {lastPage}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page <= 1}
                onClick={() => setFilters({ page: filters.page - 1 })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= lastPage}
                onClick={() => setFilters({ page: filters.page + 1 })}
              >
                Next
              </Button>
            </div>
          </nav>
        ) : null}

        <SurplusDetailPanel record={selected} onOpenChange={(open) => !open && setSelected(null)} />
      </div>
    </TooltipProvider>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 9 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
