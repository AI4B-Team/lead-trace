import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { listSurplusCounties, listSurplusStates } from "@/lib/surplus/feed.functions";
import type { SurplusFilters } from "@/lib/surplus/feed.schema";
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_LEVELS,
  ESCHEAT_BUCKETS,
  SALE_TYPES,
  SALE_TYPE_LABELS,
} from "@/lib/surplus/feed.shared";

type Option = { value: string; label: string };

/** Small inline multi-select. Stays open across selections. */
function MultiPick({
  options,
  value,
  onChange,
  placeholder,
  disabledPlaceholder,
  className,
  disabled,
}: {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabledPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const label =
    value.length === 0
      ? disabled
        ? (disabledPlaceholder ?? placeholder)
        : placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0]!)
        : `${value.length} Selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={`h-9 justify-between rounded-md px-2.5 text-sm font-normal ${className ?? ""}`}
        >
          <span
            className={`truncate text-left ${value.length === 0 ? "text-muted-foreground" : ""}`}
          >
            {label}
          </span>
          <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(18rem,--radix-popover-trigger-width)] min-w-[12rem] p-0" align="start">
        <Command>
          {options.length > 8 ? <CommandInput placeholder="Search…" /> : null}
          <CommandList>
            <CommandEmpty>Nothing Found.</CommandEmpty>
            <ScrollArea className="max-h-64">
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <Check
                      className={`mr-2 h-4 w-4 ${value.includes(o.value) ? "opacity-100" : "opacity-0"}`}
                    />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
        {value.length > 0 && (
          <div className="flex items-center justify-end border-t border-border p-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const shortMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}K` : `$${n.toLocaleString()}`;

export function SurplusFilterBar({
  filters,
  onChange,
  onReset,
  isFiltered,
}: {
  filters: SurplusFilters;
  onChange: (next: Partial<SurplusFilters>) => void;
  onReset: () => void;
  isFiltered: boolean;
}) {
  const fetchStates = useServerFn(listSurplusStates);
  const fetchCounties = useServerFn(listSurplusCounties);
  const [mobileOpen, setMobileOpen] = useState(false);

  const states = useQuery({ queryKey: ["surplus", "states"], queryFn: () => fetchStates() });
  const counties = useQuery({
    queryKey: ["surplus", "counties", filters.states],
    queryFn: () => fetchCounties({ data: { states: filters.states } }),
    enabled: filters.states.length > 0,
  });

  const countyOptions = useMemo(
    () =>
      (counties.data?.counties ?? []).map((c) => ({
        value: c.fips,
        label: `${c.name}, ${c.stateCode}`,
      })),
    [counties.data],
  );

  // Changing states must drop any county that no longer belongs to them —
  // otherwise a stale county silently returns zero rows.
  function handleStates(next: string[]) {
    const allowed = new Set(
      (counties.data?.counties ?? []).filter((c) => next.includes(c.stateCode)).map((c) => c.fips),
    );
    onChange({
      states: next,
      counties: next.length ? filters.counties.filter((f) => allowed.has(f)) : [],
      page: 1,
    });
  }

  const secondaryCount = filters.escheatBuckets.length + filters.confidence.length;

  const stateField = (
    <Field label="State">
      <MultiPick
        className="w-full lg:w-[140px]"
        placeholder="All States"
        options={(states.data?.states ?? []).map((s) => ({ value: s, label: s }))}
        value={filters.states}
        onChange={handleStates}
      />
    </Field>
  );

  const countyField = (
    <Field label="County">
      <MultiPick
        className="w-full lg:w-[175px]"
        placeholder="All Counties"
        disabledPlaceholder="Select State"
        disabled={!filters.states.length}
        options={countyOptions}
        value={filters.counties}
        onChange={(c) => onChange({ counties: c, page: 1 })}
      />
    </Field>
  );

  const saleTypeField = (
    <Field label="Sale Type">
      <MultiPick
        className="w-full lg:w-[170px]"
        placeholder="All Sale Types"
        options={SALE_TYPES.map((t) => ({ value: t, label: SALE_TYPE_LABELS[t] }))}
        value={filters.saleTypes}
        onChange={(v) => onChange({ saleTypes: v as SurplusFilters["saleTypes"], page: 1 })}
      />
    </Field>
  );

  const amountField = (
    <Field label="Surplus Amount">
      <RangeGroup className="w-full lg:w-[250px]">
        <RangeInput
          type="number"
          inputMode="numeric"
          placeholder="$ Min"
          aria-label="Minimum Surplus Amount"
          value={filters.minAmount ?? ""}
          onChange={(e) =>
            onChange({
              minAmount: e.target.value === "" ? null : Number(e.target.value),
              page: 1,
            })
          }
        />
        <RangeDivider />
        <RangeInput
          type="number"
          inputMode="numeric"
          placeholder="$ Max"
          aria-label="Maximum Surplus Amount"
          value={filters.maxAmount ?? ""}
          onChange={(e) =>
            onChange({
              maxAmount: e.target.value === "" ? null : Number(e.target.value),
              page: 1,
            })
          }
        />
      </RangeGroup>
    </Field>
  );

  const dateField = (
    <Field label="Sale Date">
      <RangeGroup className="w-full lg:w-[300px]">
        <RangeInput
          type="date"
          aria-label="Sale Date From"
          value={filters.saleDateFrom ?? ""}
          onChange={(e) => onChange({ saleDateFrom: e.target.value || null, page: 1 })}
        />
        <RangeDivider />
        <RangeInput
          type="date"
          aria-label="Sale Date To"
          value={filters.saleDateTo ?? ""}
          onChange={(e) => onChange({ saleDateTo: e.target.value || null, page: 1 })}
        />
      </RangeGroup>
    </Field>
  );

  const escheatField = (
    <Field label="Days To Escheat">
      <MultiPick
        className="w-full lg:w-[180px]"
        placeholder="Any"
        options={ESCHEAT_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
        value={filters.escheatBuckets}
        onChange={(escheatBuckets) => onChange({ escheatBuckets, page: 1 })}
      />
    </Field>
  );

  const confidenceField = (
    <Field label="Confidence">
      <MultiPick
        className="w-full lg:w-[180px]"
        placeholder="Any"
        options={CONFIDENCE_LEVELS.map((c) => ({ value: c, label: CONFIDENCE_LABELS[c] }))}
        value={filters.confidence}
        onChange={(v) => onChange({ confidence: v as SurplusFilters["confidence"], page: 1 })}
      />
    </Field>
  );

  // Active-filter chips. Rendered only when something is actually filtered, so
  // no vertical space is reserved for them.
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  for (const s of filters.states) {
    chips.push({
      key: `state-${s}`,
      label: s,
      clear: () => handleStates(filters.states.filter((x) => x !== s)),
    });
  }
  for (const f of filters.counties) {
    chips.push({
      key: `county-${f}`,
      label: countyOptions.find((o) => o.value === f)?.label ?? f,
      clear: () => onChange({ counties: filters.counties.filter((x) => x !== f), page: 1 }),
    });
  }
  for (const t of filters.saleTypes) {
    chips.push({
      key: `sale-${t}`,
      label: SALE_TYPE_LABELS[t] ?? t,
      clear: () =>
        onChange({
          saleTypes: filters.saleTypes.filter((x) => x !== t),
          page: 1,
        }),
    });
  }
  if (filters.minAmount != null || filters.maxAmount != null) {
    const label =
      filters.minAmount != null && filters.maxAmount != null
        ? `${shortMoney(filters.minAmount)} – ${shortMoney(filters.maxAmount)}`
        : filters.minAmount != null
          ? `${shortMoney(filters.minAmount)}+`
          : `Up To ${shortMoney(filters.maxAmount!)}`;
    chips.push({
      key: "amount",
      label,
      clear: () => onChange({ minAmount: null, maxAmount: null, page: 1 }),
    });
  }
  if (filters.saleDateFrom || filters.saleDateTo) {
    chips.push({
      key: "dates",
      label: `${filters.saleDateFrom ?? "Any"} → ${filters.saleDateTo ?? "Any"}`,
      clear: () => onChange({ saleDateFrom: null, saleDateTo: null, page: 1 }),
    });
  }
  for (const b of filters.escheatBuckets) {
    chips.push({
      key: `escheat-${b}`,
      label: ESCHEAT_BUCKETS.find((x) => x.value === b)?.label ?? b,
      clear: () =>
        onChange({ escheatBuckets: filters.escheatBuckets.filter((x) => x !== b), page: 1 }),
    });
  }
  for (const c of filters.confidence) {
    chips.push({
      key: `confidence-${c}`,
      label: CONFIDENCE_LABELS[c] ?? c,
      clear: () => onChange({ confidence: filters.confidence.filter((x) => x !== c), page: 1 }),
    });
  }

  return (
    <div className="space-y-2">
      {/* Desktop / tablet toolbar */}
      <div className="hidden items-end gap-2.5 rounded-[15px] border border-border bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:flex md:flex-wrap lg:flex-nowrap">
        {stateField}
        {countyField}
        {saleTypeField}
        {amountField}
        {dateField}
        <div className="ml-auto flex items-end gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-[130px] justify-start rounded-md px-2.5 text-sm font-normal"
              >
                <SlidersHorizontal className="mr-2 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">More Filters</span>
                {secondaryCount > 0 ? (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-foreground">
                    {secondaryCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3 p-3">
              {escheatField}
              {confidenceField}
              {secondaryCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => onChange({ escheatBuckets: [], confidence: [], page: 1 })}
                >
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Clear Filters
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Mobile: a single Filters trigger opening a sheet with every filter */}
      <div className="md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-9 rounded-md">
              <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
              Filters
              {chips.length > 0 ? (
                <span className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {chips.length}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="space-y-3 pb-4 pt-2">
              {stateField}
              {countyField}
              {saleTypeField}
              {amountField}
              {dateField}
              {escheatField}
              {confidenceField}
              {isFiltered ? (
                <Button variant="ghost" className="w-full" onClick={onReset}>
                  <X className="mr-1 h-4 w-4" aria-hidden />
                  Clear Filters
                </Button>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {chips.length > 0 ? (
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
            >
              <span className="max-w-[14rem] truncate">{chip.label}</span>
              <X className="h-3 w-3 opacity-60" aria-hidden />
              <span className="sr-only">Remove Filter</span>
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={onReset}
          >
            Clear All
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Two inputs that read as one control. */
function RangeGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`flex h-9 items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function RangeDivider() {
  return <span className="px-1 text-xs text-muted-foreground">–</span>;
}

function RangeInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
    />
  );
}
