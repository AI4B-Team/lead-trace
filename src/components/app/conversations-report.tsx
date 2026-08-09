/**
 * What happened in your conversations — analytics, so it lives with the rest of
 * your analytics on Performance.
 *
 * Everything here is segmented by record type. A foreclosure objection and a
 * roofer objection are unrelated, and an average across both describes neither.
 */
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OUTCOME_LABEL,
  SENTIMENT_LABEL,
  objectionLabel,
  type Outcome,
  type Sentiment,
} from "@/lib/agents/labeler.shared";

export type OutcomeRow = {
  outcome: string;
  objection_category: string | null;
  sentiment: string | null;
  touches_before_outcome: number | null;
  flagged: boolean;
  record_type?: string | null;
};

const UNTYPED = "__untyped__";

function summarise(rows: OutcomeRow[]) {
  const byOutcome = new Map<string, number>();
  const byObjection = new Map<string, number>();
  const bySentiment = new Map<string, number>();
  let touchSum = 0;
  let touchCount = 0;
  let flagged = 0;
  for (const o of rows) {
    byOutcome.set(o.outcome, (byOutcome.get(o.outcome) ?? 0) + 1);
    if (o.objection_category)
      byObjection.set(o.objection_category, (byObjection.get(o.objection_category) ?? 0) + 1);
    if (o.sentiment) bySentiment.set(o.sentiment, (bySentiment.get(o.sentiment) ?? 0) + 1);
    if (typeof o.touches_before_outcome === "number") {
      touchSum += o.touches_before_outcome;
      touchCount += 1;
    }
    if (o.flagged) flagged += 1;
  }
  return {
    byOutcome,
    byObjection,
    bySentiment,
    avgTouches: touchCount ? touchSum / touchCount : null,
    flagged,
    total: rows.length,
  };
}

const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export function ConversationsReport({ outcomes }: { outcomes: OutcomeRow[] }) {
  const [recordType, setRecordType] = useState<string>("all");

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of outcomes) {
      const key = o.record_type || UNTYPED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return sorted(counts);
  }, [outcomes]);

  const scoped = useMemo(
    () =>
      recordType === "all"
        ? outcomes
        : outcomes.filter((o) => (o.record_type || UNTYPED) === recordType),
    [outcomes, recordType],
  );
  const stats = useMemo(() => summarise(scoped), [scoped]);

  if (outcomes.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No Conversations Labeled Yet. The Labeler Reads A Conversation Once It Has Finished — Idle
          For Three Days, Opted Out, Or Closed By Its Sequence.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-black text-foreground">
            What Happened In Your Conversations
          </h2>
          <p className="text-xs text-muted-foreground">
            Segmented By Record Type — Averaging Across Unrelated Lead Types Describes Neither.
          </p>
        </div>
        <Select value={recordType} onValueChange={setRecordType}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Record Types ({outcomes.length})</SelectItem>
            {types.map(([key, count]) => (
              <SelectItem key={key} value={key}>
                {key === UNTYPED ? "No Record Type On File" : key} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display font-bold">Outcomes</h3>
              <span className="text-xs text-muted-foreground">{stats.total} Labeled</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {sorted(stats.byOutcome).map(([key, count]) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 text-muted-foreground">
                    {OUTCOME_LABEL[key as Outcome] ?? key}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (count / Math.max(1, stats.total)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
            {recordType === "all" && types.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {types.map(([key, count]) => (
                  <Badge key={key} variant="outline" className="cursor-pointer" onClick={() => setRecordType(key)}>
                    {key === UNTYPED ? "No Record Type" : key} · {count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-display font-bold">Objections, By Name</h3>
              <p className="text-[11px] text-muted-foreground">
                {recordType === "all" ? "Across All Record Types" : recordType === UNTYPED ? "Leads With No Record Type" : recordType}
              </p>
              {stats.byObjection.size === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">None Recorded Yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {sorted(stats.byObjection)
                    .slice(0, 6)
                    .map(([key, count]) => (
                      <li key={key} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{objectionLabel(key)}</span>
                        <span className="tabular-nums">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Average Touches Before Outcome</span>
                <span className="tabular-nums">
                  {stats.avgTouches === null ? "—" : stats.avgTouches.toFixed(1)}
                </span>
              </div>
              {sorted(stats.bySentiment).map(([key, count]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {SENTIMENT_LABEL[key as Sentiment] ?? key}
                  </span>
                  <span className="tabular-nums">{count}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5">
                <span className="text-muted-foreground">Flagged For A Human</span>
                <span className="tabular-nums">{stats.flagged}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}