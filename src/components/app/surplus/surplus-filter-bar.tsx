import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronsUpDown } from "lucide-react";
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
  className,
  disabled,
}: {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const label =
    value.length === 0
      ? placeholder
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
          className={`justify-between font-normal ${className ?? ""}`}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">

      <Field label="State">
        <MultiPick
          className="w-36"
          placeholder="All States"
          options={(states.data?.states ?? []).map((s) => ({ value: s, label: s }))}
          value={filters.states}
          onChange={handleStates}
        />
      </Field>

      <Field label="County">
        <MultiPick
          className="w-52"
          placeholder={filters.states.length ? "All Counties" : "Pick A State First"}
          disabled={!filters.states.length}
          options={countyOptions}
          value={filters.counties}
          onChange={(c) => onChange({ counties: c, page: 1 })}
        />
      </Field>

      <Field label="Sale Type">
        <MultiPick
          className="w-52"
          placeholder="All Sale Types"
          options={SALE_TYPES.map((t) => ({ value: t, label: SALE_TYPE_LABELS[t] }))}
          value={filters.saleTypes}
          onChange={(v) => onChange({ saleTypes: v as SurplusFilters["saleTypes"], page: 1 })}
        />
      </Field>

      <Field label="Surplus Amount">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            className="w-28"
            placeholder="Min"
            value={filters.minAmount ?? ""}
            onChange={(e) =>
              onChange({ minAmount: e.target.value === "" ? null : Number(e.target.value), page: 1 })
            }
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="number"
            inputMode="numeric"
            className="w-28"
            placeholder="Max"
            value={filters.maxAmount ?? ""}
            onChange={(e) =>
              onChange({ maxAmount: e.target.value === "" ? null : Number(e.target.value), page: 1 })
            }
          />
        </div>
      </Field>

      <Field label="Sale Date">
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="w-36"
            value={filters.saleDateFrom ?? ""}
            onChange={(e) => onChange({ saleDateFrom: e.target.value || null, page: 1 })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-36"
            value={filters.saleDateTo ?? ""}
            onChange={(e) => onChange({ saleDateTo: e.target.value || null, page: 1 })}
          />
        </div>
      </Field>

      <Field label="Days To Escheat">
        <MultiPick
          className="w-44"
          placeholder="Any"
          options={ESCHEAT_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
          value={filters.escheatBuckets}
          onChange={(escheatBuckets) => onChange({ escheatBuckets, page: 1 })}
        />
      </Field>

      <Field label="Confidence">
        <MultiPick
          className="w-44"
          placeholder="Any"
          options={CONFIDENCE_LEVELS.map((c) => ({ value: c, label: CONFIDENCE_LABELS[c] }))}
          value={filters.confidence}
          onChange={(v) => onChange({ confidence: v as SurplusFilters["confidence"], page: 1 })}
        />
      </Field>

      {isFiltered ? (
        <Button variant="ghost" size="sm" onClick={onReset} className="mb-0.5">
          <X className="mr-1 h-4 w-4" aria-hidden />
          Clear Filters
        </Button>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}