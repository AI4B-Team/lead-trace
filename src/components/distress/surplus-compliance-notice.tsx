import { Scale } from "lucide-react";
import { surplusNoticeForState } from "@/lib/distress/surplus";

/**
 * State-level compliance notice for surplus records. Informational only —
 * nothing in the product is gated or blocked on it.
 */
export function SurplusComplianceNotice({
  state,
  className,
}: {
  state?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground ${className ?? ""}`}
    >
      <Scale className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p>
        <span className="font-semibold text-foreground">Before You Contact Claimants — </span>
        {surplusNoticeForState(state)}
      </p>
    </div>
  );
}
