import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { escheatTier, formatFeedDate, type Confidence } from "@/lib/surplus/feed.shared";

const DERIVED_TOOLTIP =
  "Computed from the auction result. Not yet confirmed against the clerk's published list.";

export function ConfidenceBadge({
  confidence,
  sourceUrl,
}: {
  confidence: Confidence;
  sourceUrl?: string | null;
}) {
  if (confidence === "clerk_confirmed") {
    const badge = (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
        Clerk Confirmed
        {sourceUrl ? <ExternalLink className="ml-1 h-3 w-3" aria-hidden /> : null}
      </Badge>
    );
    if (!sourceUrl) return badge;
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label="Open the clerk's published list in a new tab"
      >
        {badge}
      </a>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="border-warn/40 bg-warn/10 text-warn">
          Derived
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{DERIVED_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The countdown is the signature element of this feed. A null value renders an
 * em dash and nothing else: never compute a countdown for a state that
 * publishes no escheat window.
 */
export function EscheatCountdown({
  days,
  escheatDate,
  destination,
}: {
  days: number | null;
  escheatDate: string | null;
  destination?: string | null;
}) {
  const tier = escheatTier(days);

  if (tier === null) {
    return (
      <span className="tabular-nums text-muted-foreground" title="No Published Escheat Window">
        —
      </span>
    );
  }

  const d = days as number;
  const label = d < 0 ? `Passed ${Math.abs(d)}d Ago` : d === 0 ? "Today" : `${d}d`;
  const tone =
    tier === "critical"
      ? "text-destructive font-semibold"
      : tier === "warning"
        ? "text-warn font-medium"
        : "text-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`tabular-nums ${tone}`}>{label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Escheats {formatFeedDate(escheatDate)}
        {destination ? ` to ${destination}` : ""}.
      </TooltipContent>
    </Tooltip>
  );
}