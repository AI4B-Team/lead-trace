/**
 * The fixed-width reading column. It owns the scroller and the 520px measure —
 * nothing else. Callers pass already-rendered items as children.
 */
import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export function ConversationThread({
  children,
  scrollRef,
  /** Newest-first rendering (column-reverse) keeps the latest message in view. */
  newestFirst = true,
  className,
}: {
  children: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  newestFirst?: boolean;
  className?: string;
}) {
  return (
    <div
      ref={scrollRef}
      className={cn("min-h-0 flex-1 overflow-y-auto thin-scroll px-4 py-5", className)}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[520px] gap-3",
          newestFirst ? "flex-col-reverse" : "flex-col",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="py-1 text-center text-xs text-muted-foreground">
      <span>{label}</span>
    </div>
  );
}