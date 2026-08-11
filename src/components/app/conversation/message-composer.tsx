/**
 * Composer: [+] menu, textarea, send. Everything domain-specific arrives as
 * menu content or slots, so this component stays reusable.
 */
import type { KeyboardEvent, ReactNode } from "react";
import { Loader2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** GSM-7 segmentation is close enough for an operator-facing counter. */
function segmentsFor(len: number) {
  if (len === 0) return 0;
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

export function MessageComposer({
  value,
  onChange,
  onSend,
  onKeyDown,
  placeholder,
  disabled = false,
  readOnly = false,
  sending = false,
  sendTitle,
  menu,
  overlay,
  above,
  showCounter = true,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  sending?: boolean;
  sendTitle?: string;
  /** Items for the "+" dropdown. */
  menu?: ReactNode;
  /** Absolutely positioned layer above the box, e.g. a slash-command menu. */
  overlay?: ReactNode;
  /** Content rendered directly above the box, e.g. suggested replies. */
  above?: ReactNode;
  showCounter?: boolean;
  className?: string;
}) {
  const len = value.length;
  return (
    <div className={cn("border-t px-4 py-3", className)}>
      <div className="relative mx-auto w-full max-w-[520px]">
        {above}
        {overlay}
        <div className="flex items-end gap-2">
          {menu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="More Options"
                  className="h-9 w-9 shrink-0 rounded-full p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                {menu}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="min-w-0 flex-1 rounded-2xl border bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={readOnly}
              className="max-h-40 min-h-[38px] w-full resize-none bg-transparent px-3.5 py-2 text-[15px] leading-[1.5] focus-visible:outline-none disabled:opacity-60"
            />
          </div>
          <Button
            onClick={onSend}
            disabled={disabled || sending || !value.trim()}
            title={sendTitle}
            size="sm"
            aria-label="Send"
            className="h-9 w-9 shrink-0 rounded-full p-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {showCounter && (
          <div className="pr-11 pt-1 text-right text-[11px] text-muted-foreground tabular-nums">
            {len} Characters · {segmentsFor(len)} Segment{segmentsFor(len) === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}
