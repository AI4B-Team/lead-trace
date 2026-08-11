/**
 * One-line conversation header. A single status dot carries all state; the
 * rest is identity and a details toggle. Presentational only.
 */
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ContextState = "clear" | "attention" | "blocked";

const DOT_CLASS: Record<ContextState, string> = {
  clear: "bg-success",
  attention: "bg-warn",
  blocked: "bg-danger",
};

export function ContextStrip({
  name,
  phone,
  facts = [],
  state,
  stateReason,
  statusLabel,
  statusOptions = [],
  onSelectStatus,
  detailsOpen,
  onToggleDetails,
  disabled = false,
}: {
  name: string;
  phone?: string | null;
  /** Extra inline facts, e.g. campaign name and touch number. */
  facts?: string[];
  state: ContextState;
  stateReason: string;
  statusLabel?: string | null;
  statusOptions?: Array<{ value: string; label: string }>;
  onSelectStatus?: (value: string | null) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2 text-[13px]">
      <span
        title={stateReason}
        aria-label={stateReason}
        className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[state])}
      />
      <span className="min-w-0 truncate font-semibold">{name}</span>
      {phone && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="shrink-0 font-mono text-muted-foreground">{phone}</span>
        </>
      )}
      {facts.map((f) => (
        <span key={f} className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="text-muted-foreground/60">·</span>
          <span className="truncate text-muted-foreground">{f}</span>
        </span>
      ))}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!!statusOptions.length && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="h-6 rounded-full px-2 text-[12px] text-muted-foreground"
              >
                {statusLabel ?? "Set Status"}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {statusOptions.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  className={cn("text-xs", s.label === statusLabel && "font-semibold")}
                  onClick={() => onSelectStatus?.(s.value)}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
              {statusLabel && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs" onClick={() => onSelectStatus?.(null)}>
                    Clear Status
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          className="h-6 rounded-full px-2 text-[12px] text-muted-foreground"
        >
          Details
          <ChevronDown
            className={cn("ml-1 h-3 w-3 transition-transform", detailsOpen && "rotate-180")}
          />
        </Button>
      </div>
    </div>
  );
}