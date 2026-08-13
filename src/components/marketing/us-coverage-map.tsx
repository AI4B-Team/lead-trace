import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/us-geo";

/**
 * Stylized tile map of the U.S. — one square per state, laid out in roughly
 * geographic positions. A tile grid (rather than real geography) keeps every
 * state clickable at the same size and needs no map dependency or topojson.
 */
export type MapStatus = "live" | "expanding" | "later";

export type MapState = {
  code: string;
  status: MapStatus;
  records: number;
  counties: number;
  recordTypes: number;
  lastPull: string | null;
};

// 12 columns wide; "" is empty space.
const GRID: string[][] = [
  ["AK", "", "", "", "", "", "", "", "", "", "", "ME"],
  ["", "", "", "", "", "", "", "", "", "VT", "NH", ""],
  ["WA", "ID", "MT", "ND", "MN", "WI", "", "MI", "", "NY", "MA", "RI"],
  ["OR", "NV", "WY", "SD", "IA", "IL", "IN", "OH", "PA", "NJ", "CT", ""],
  ["CA", "UT", "CO", "NE", "MO", "KY", "WV", "VA", "MD", "DE", "", ""],
  ["", "AZ", "NM", "KS", "AR", "TN", "NC", "SC", "DC", "", "", ""],
  ["", "", "", "OK", "LA", "MS", "AL", "GA", "", "", "", ""],
  ["HI", "", "", "TX", "", "", "", "FL", "", "", "", ""],
];

const TONE: Record<MapStatus, string> = {
  live: "bg-primary text-primary-foreground border-primary",
  expanding: "bg-primary/15 text-primary border-primary/30",
  later: "bg-muted/60 text-muted-foreground/70 border-border",
};

function stateName(code: string) {
  return US_STATES.find((s) => s.code === code)?.name ?? code;
}

export function UsCoverageMap({ states }: { states: MapState[] }) {
  const byCode = new Map(states.map((s) => [s.code, s]));
  const liveCodes = states.filter((s) => s.status !== "later").map((s) => s.code);
  const [hovered, setHovered] = useState<string | null>(liveCodes[0] ?? null);
  const active = hovered ? byCode.get(hovered) : null;

  return (
    <div className="grid items-stretch gap-6 overflow-hidden rounded-3xl border border-border bg-surface p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,0.85fr)] lg:gap-8 lg:p-7">
      <div>
        <div className="flex flex-col gap-1.5">
          {GRID.map((row, i) => (
            <div key={i} className="flex gap-1.5">
              {row.map((code, j) => {
                if (!code) return <div key={j} className="aspect-square flex-1" />;
                const st = byCode.get(code);
                const status: MapStatus = st?.status ?? "later";
                const label = `${stateName(code)} — ${
                  status === "live" ? "live coverage" : status === "expanding" ? "expanding" : "coming later"
                }`;
                const tile = (
                  <span
                    className={cn(
                      "flex aspect-square w-full items-center justify-center rounded-lg border font-mono text-[11px] font-bold transition-transform sm:text-[13px]",
                      TONE[status],
                      status !== "later" && "hover:scale-110",
                      hovered === code && "ring-2 ring-primary/50 scale-105",
                    )}
                  >
                    {code}
                  </span>
                );
                return (
                  <div
                    key={j}
                    className="flex-1"
                    onMouseEnter={() => status !== "later" && setHovered(code)}
                  >
                    {status === "later" ? (
                      <span title={label} aria-label={label}>
                        {tile}
                      </span>
                    ) : (
                      <Link
                        to="/distress-feed/states/$state"
                        params={{ state: code.toLowerCase() }}
                        title={label}
                        aria-label={label}
                      >
                        {tile}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px] bg-primary" /> Live
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px] border border-primary/30 bg-primary/15" /> Expanding
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px] border border-border bg-muted/60" /> Coming Later
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-center rounded-2xl bg-surface-muted p-6 lg:rounded-none lg:border-l lg:border-border lg:bg-transparent lg:pl-8">
        {active ? (
          <>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-2xl font-bold text-foreground">
                {stateName(active.code)}
              </h3>
              {active.status === "live" ? (
                <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  Live
                </span>
              ) : (
                <span className="rounded-full border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                  Expanding
                </span>
              )}
            </div>
            <dl className="mt-4 space-y-2 font-mono text-sm text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>Records</dt>
                <dd className="text-foreground">{active.records.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Counties</dt>
                <dd className="text-foreground">{active.counties.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Record Types</dt>
                <dd className="text-foreground">{active.recordTypes.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Last Pull</dt>
                <dd className="text-foreground">{active.lastPull ?? "—"}</dd>
              </div>
            </dl>
            <Link
              to="/distress-feed/states/$state"
              params={{ state: active.code.toLowerCase() }}
              className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              Explore {stateName(active.code)} <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Hover a highlighted state to see what is live there today.
          </p>
        )}
      </div>
    </div>
  );
}