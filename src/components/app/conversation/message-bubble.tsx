/**
 * A single message bubble plus its meta line. Presentational only: it takes
 * primitives and renders them. No data fetching, no product-specific types.
 */
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export function MessageBubble({
  align,
  body,
  meta,
  isBot = false,
  className,
}: {
  align: "left" | "right";
  body: string;
  /** Pre-formatted meta text (time · day · status). Rendered outside the bubble. */
  meta?: string;
  isBot?: boolean;
  className?: string;
}) {
  const right = align === "right";
  return (
    <div className={cn("flex flex-col gap-1", right ? "items-end" : "items-start", className)}>
      <div
        className={cn(
          "max-w-[76%] rounded-[14px] px-3.5 py-2 text-[15px] leading-[1.55] whitespace-pre-wrap break-words",
          right
            ? "bg-primary text-primary-foreground rounded-br-[4px]"
            : "bg-muted text-foreground rounded-bl-[4px]",
        )}
      >
        {body}
      </div>
      {(meta || isBot) && (
        <div
          className={cn(
            "flex items-center gap-1 px-1 text-[11px] text-muted-foreground",
            right ? "flex-row-reverse" : "flex-row",
          )}
        >
          {meta && <span>{meta}</span>}
          {isBot && (
            <span className="inline-flex items-center gap-0.5">
              <Bot className="h-3 w-3" /> AI
            </span>
          )}
        </div>
      )}
    </div>
  );
}