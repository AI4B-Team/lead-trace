import { CheckCircle2, MapPin, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FunnelStages } from "@/components/app/pipeline-funnel";

const STEPS = [
  { key: "found", icon: MapPin, label: "Records Received" },
  { key: "deduped", icon: Trash2, label: "Duplicates Removed" },
  { key: "textable", icon: Smartphone, label: "Mobile Verified" },
  { key: "scrubbed", icon: ShieldCheck, label: "DNC Scrubbed" },
  { key: "clean", icon: CheckCircle2, label: "Ready To Contact" },
] as const;

/**
 * Outcome-first pipeline flow: one row of icon + count + plain-language label,
 * so the progression reads instantly instead of being decoded from bar heights.
 */
export function PipelineFlow({
  stages,
  className,
}: {
  stages: FunnelStages;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-5", className)}>
      {STEPS.map((s, i) => {
        const value = stages[s.key] ?? 0;
        const last = i === STEPS.length - 1;
        return (
          <div
            key={s.key}
            className={cn(
              "relative flex flex-col items-center rounded-2xl border p-5 text-center",
              last ? "border-primary bg-primary/5" : "border-border bg-surface",
            )}
          >
            <s.icon className={cn("h-5 w-5", last ? "text-primary" : "text-foreground/50")} />
            <div className="mt-3 font-display text-2xl font-black tabular-nums text-foreground">
              {value.toLocaleString()}
            </div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            {!last && (
              <span
                aria-hidden
                className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-muted-foreground sm:bottom-auto sm:left-auto sm:top-1/2 sm:-right-2.5 sm:translate-x-0 sm:-translate-y-1/2"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                  <path className="sm:hidden" d="M6 12 0 4h12z" />
                  <path className="hidden sm:block" d="M12 6 4 12V0z" />
                </svg>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
