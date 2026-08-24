import { ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFunnel, stageFillPercent, type FunnelVariant } from "@/lib/funnel-math";
import { useCountUp } from "@/hooks/use-count-up";
import type { ReactNode } from "react";

export type FunnelStages = {
  found: number;
  deduped: number;
  /** Marketing wording for the Verified stage; app surfaces pass `verified`. */
  textable?: number;
  verified?: number;
  skipTraced?: number;
  scrubbed: number;
  clean: number;
};

/**
 * The signature Pipeline Funnel. Each card shows the records REMAINING after
 * that stage, connected left-to-right by arrows so the journey reads as one
 * continuous narrowing. Clean is the finish line: brand-red outline, check
 * mark, and a "Ready To Launch" caption.
 *
 * Stage math and wording come from `@/lib/funnel-math` — the single source of
 * truth guarded by `funnel-math.test.ts`.
 */
export function PipelineFunnel({
  stages,
  traced,
  size = "lg",
  animate = false,
  completedThrough,
  readyPill,
  variant = "phone",
  phonesPending = false,
  className,
}: {
  stages: FunnelStages;
  /** How many records were skip traced (fills, never removals). */
  traced?: number;
  size?: "lg" | "sm";
  /** Cascade the counts up one card at a time (results view only). */
  animate?: boolean;
  /** Index of the last finished stage; arrows up to it render in brand red. */
  completedThrough?: number;
  /** Pill centered above the Clean card (e.g. "✓ 8 Ready To Launch"). */
  readyPill?: ReactNode;
  /** "creator" swaps Verified / Traced for a single Email Found stage. */
  variant?: FunnelVariant;
  /** No phone vendor yet: carrier check + scrub stages read "coming soon". */
  phonesPending?: boolean;
  className?: string;
}) {
  const small = size === "sm";
  const verified = stages.verified ?? stages.textable ?? stages.deduped;
  const built = buildFunnel(
    {
      found: stages.found,
      deduped: stages.deduped,
      verified,
      traced: traced ?? stages.skipTraced ?? 0,
      scrubbed: stages.scrubbed,
      clean: stages.clean,
    },
    { variant, phonesPending },
  );
  const found = built[0]!.remaining;
  const done = completedThrough ?? built.length - 1;

  return (
    <div className={cn("flex items-start", readyPill ? "pt-10" : "pt-1", className)}>
      {built.map((s, i) => {
        // The terminal stage carries the celebratory treatment: "Clean" for
        // lead runs, "Exported" for research datasets.
        const isClean = s.key === "clean" || s.key === "exported";
        const pct = stageFillPercent(s.remaining, found, small ? 12 : 8);
        return (
          <div key={s.key} className="flex min-w-0 flex-1 items-stretch">
            <div className="relative min-w-0 flex-1">
              {isClean && readyPill && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-full">
                  {readyPill}
                </div>
              )}
              <div
                className={cn(
                  "relative w-full overflow-hidden rounded-xl border",
                  small ? "h-9" : "h-32",
                  isClean
                    ? "border-2 border-primary bg-primary/5 shadow-[0_6px_20px_-8px_var(--primary)]"
                    : "border-border/60 bg-muted/30",
                )}
              >
                <div
                  className={cn(
                    "absolute bottom-0 left-0 right-0 transition-[height] duration-700 ease-out",
                    isClean ? "bg-primary" : "bg-foreground/[0.07]",
                  )}
                  // The finish line fills completely so its count reads as
                  // white-on-red instead of disappearing into the fill line.
                  style={{ height: isClean ? "100%" : `${pct}%` }}
                />
                {!small && (
                  <StageValue
                    remaining={s.remaining}
                    isClean={isClean}
                    animate={animate}
                    index={i}
                    // Phone-pending records runs never actually ran the carrier
                    // check, skip trace, or DNC scrub on a real number, so show
                    // an honest badge ON each box instead of a count that would
                    // look verified/traced.
                    text={
                      // Carrier check is a local line-type classifier (no phone
                      // vendor API): on a phoneless run it truly verified 0
                      // numbers, so show "0" (matches the KPI strip) instead of
                      // the 206 pass-through count that would look verified. Skip
                      // Trace is the one vendor-gated stage, so it reads "Coming
                      // Soon". Scrub had no numbers to check → "Awaiting Phone".
                      phonesPending && s.key === "verified"
                        ? "0"
                        : phonesPending && s.key === "skipTraced"
                          ? "Coming Soon"
                          : phonesPending && s.key === "scrubbed"
                            ? "Awaiting Phone"
                            : null
                    }
                  />
                )}
              </div>
              <div
                className={cn(
                  "mt-1.5 text-center font-semibold",
                  // Marketing/detail sizes wrap onto a second line instead of
                  // truncating: "Mobile Verified" must never read "Mobile…".
                  small ? "truncate text-[9px] uppercase tracking-wider" : "text-xs leading-tight",
                  isClean ? "text-primary" : "text-foreground/70",
                )}
              >
                {s.label}
              </div>
              {!small && (
                <div
                  className={cn(
                    "text-center text-[10px] leading-tight tabular-nums",
                    s.delta ? "font-semibold text-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {s.delta ?? s.annotation ?? "\u00A0"}
                </div>
              )}
            </div>
            {i < built.length - 1 && (
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center",
                  small ? "h-9 w-4" : "h-32 w-6",
                )}
                aria-hidden
              >
                <ChevronRight
                  className={cn(
                    // Completed hops glow brand-red: "we processed this successfully".
                    i < done ? "text-primary" : "text-muted-foreground/40",
                    small ? "h-3 w-3" : "h-4 w-4",
                  )}
                  strokeWidth={2.5}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StageValue({
  remaining,
  isClean,
  animate,
  index,
  text = null,
}: {
  remaining: number;
  isClean: boolean;
  animate: boolean;
  index: number;
  /** When set, render this label ON the box instead of the count. */
  text?: string | null;
}) {
  const shown = useCountUp(remaining, { enabled: animate, delay: index * 450, duration: 700 });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1">
      {isClean && <Check className="h-5 w-5 text-primary-foreground" strokeWidth={3} />}
      {text ? (
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-center font-display text-xs font-bold leading-tight text-primary lg:text-sm">
          {text}
        </span>
      ) : (
        <span
          className={cn(
            // Scales down on narrow cards so a 4-digit count never bleeds past
            // the card edge the way "1,000" did.
            "font-display font-black leading-none tabular-nums",
            isClean
              ? "text-2xl text-primary-foreground lg:text-3xl"
              : "text-base text-foreground/80 lg:text-xl",
          )}
        >
          {shown.toLocaleString()}
        </span>
      )}
    </div>
  );
}
