import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpHint } from "@/components/app/help-hint";

/** Compact metric tile used across Settings, Team, and Admin headers. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  onClick,
  help,
  onHintClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** "alert" = live problem (amber accent); "muted" = nothing to do here. */
  tone?: "default" | "alert" | "muted";
  onClick?: () => void;
  /** Plain-language explanation shown behind a shared "?" hint. */
  help?: string;
  /** Makes the subtitle its own action (e.g. filter to never-launched lists). */
  onHintClick?: () => void;
}) {
  return (
    // Always a div: the tile can contain its own "?" hint button, and a button
    // inside a button is invalid HTML (breaks hydration). Keyboard support is
    // added explicitly when the tile itself is clickable.
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "relative rounded-xl border px-4 py-3 text-left",
        tone === "alert"
          ? "border-warn/40 bg-warn/[0.07]"
          : tone === "muted"
            ? "border-border bg-surface opacity-70"
            : "border-border bg-surface",
        onClick && "cursor-pointer transition-colors hover:border-foreground/25 hover:bg-surface-muted",
      )}
    >
      {help && (
        <span className="absolute right-2 top-2">
          <HelpHint title={label} side="top" align="end">
            {help}
          </HelpHint>
        </span>
      )}
      <div
        className={cn(
          "flex items-center gap-1.5 pr-6 text-[11px] font-semibold uppercase tracking-[0.14em]",
          tone === "alert" ? "text-warn" : "text-muted-foreground",
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-black leading-none tabular-nums",
          tone === "alert" ? "text-warn" : "text-foreground",
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {hint &&
        (onHintClick ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onHintClick();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onHintClick();
              }
            }}
            className="mt-1 block cursor-pointer text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {hint}
          </span>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        ))}
    </div>
  );
}
