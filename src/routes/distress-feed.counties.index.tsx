import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ArrowRight } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Input } from "@/components/ui/input";
import { getFeedStates } from "@/lib/distress-feed.functions";
import { formatDate, type FeedStateRow } from "@/lib/distress-feed.shared";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";

export const Route = createFileRoute("/distress-feed/counties/")({
  loader: () => getFeedStates(),
  head: () => ({
    meta: [
      { title: "Distress Feed Coverage — Counties And States We Pull Nightly" },
      {
        name: "description",
        content:
          "Every state and county in the LeadTrace Distress Feed, with record volume and the last pull date. Request a county and we will add it.",
      },
      { property: "og:title", content: "Distress Feed Coverage By County" },
      { property: "og:description", content: "Record volume and last pull date for every covered county." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/distress-feed/counties" }],
  }),
  component: CountiesIndex,
  errorComponent: RouteErrorState,
  notFoundComponent: () => <RouteNotFoundState />,
});

function CountiesIndex() {
  const { states } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const filtered = states.filter((s: FeedStateRow) => s.state.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-5xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">Distress Feed</Link> / Coverage
        </nav>
        <h1 className="mt-4 font-display text-4xl font-bold text-foreground">Distress Feed Coverage</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          These are the states we pull county distress records for. Open a state to see its counties, the
          new filings this week, and the last time we pulled.
        </p>

        <div className="relative mt-8 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by state"
            className="pl-9"
          />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {filtered.map((s: FeedStateRow) => (
            <Link
              key={s.state}
              to="/distress-feed/counties/$state"
              params={{ state: s.state.toLowerCase() }}
              className="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-bold text-foreground">{s.state}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {s.counties} counties · {s.total_records.toLocaleString()} records · +{s.new_this_week.toLocaleString()} this week
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Last pull {formatDate(s.last_pull_at)}</p>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Can't Find Your County?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tell us the county and record type. Free public-records sources get built first — a login is
            never a reason we say no.
          </p>
          <Link
            to="/start"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            Request it <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}
