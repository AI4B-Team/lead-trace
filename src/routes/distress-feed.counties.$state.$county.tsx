import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { getCountyPage } from "@/lib/distress-feed.functions";
import {
  countyDescription, countySlug, countyFromSlug, countyTitle, formatAmount, formatDate,
  recordTypeById, recordTypeLabel, RECORD_TYPES,
  type FeedPreviewRow, type FeedCountyRow, type FeedGuideRow,
} from "@/lib/distress-feed.shared";
import { US_STATES } from "@/lib/us-geo";
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";
import { canonicalUrl } from "@/lib/seo";
import { SurplusRecordCard, type SurplusCardRecord } from "@/components/distress/surplus-record-card";
import { SurplusComplianceNotice } from "@/components/distress/surplus-compliance-notice";

export const Route = createFileRoute("/distress-feed/counties/$state/$county")({
  loader: async ({ params }) => {
    if (params.state.length !== 2) throw notFound();
    const data = await getCountyPage({
      data: { state: params.state.toUpperCase(), county: countyFromSlug(params.county) },
    });
    const state = params.state.toUpperCase();
    return { ...data, state, stateName: US_STATES.find((s) => s.code === state)?.name ?? state };
  },
  head: ({ loaderData }) => {
    const d = loaderData as
      | { countyName: string; state: string; county: { total_records: number } | null }
      | undefined;
    if (!d) return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    const total = Number(d.county?.total_records ?? 0);
    const title = countyTitle(d.countyName, d.state);
    const description = countyDescription(d.countyName, d.state, total);
    const url = `/distress-feed/counties/${d.state.toLowerCase()}/${countySlug(d.countyName)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonicalUrl(url) }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Distress Feed", item: "/distress-feed" },
                { "@type": "ListItem", position: 2, name: "Coverage", item: "/distress-feed/counties" },
                { "@type": "ListItem", position: 3, name: d.state, item: `/distress-feed/counties/${d.state.toLowerCase()}` },
                { "@type": "ListItem", position: 4, name: `${d.countyName} County` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "Dataset",
              name: `${d.countyName} County, ${d.state} distress records`,
              description,
              spatialCoverage: `${d.countyName} County, ${d.state}`,
              creator: { "@type": "Organization", name: "LeadTrace" },
              isAccessibleForFree: false,
              variableMeasured: RECORD_TYPES.map((r) => r.label),
            },
          ]),
        },
      ],
    };
  },
  component: CountyPage,
  errorComponent: RouteErrorState,
  notFoundComponent: CountyMissing,
});

function CountyMissing() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground">County Not Found</h1>
        <Link to="/distress-feed/counties" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          Browse covered counties <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </MarketingLayout>
  );
}

function CountyPage() {
  const { county, countyName, state, stateName, preview, siblings, guides, configuredTypes } =
    Route.useLoaderData();
  const total = Number(county?.total_records ?? 0);
  const week = Number(county?.new_this_week ?? 0);
  const available = (county?.record_types?.length ? county.record_types : configuredTypes) ?? [];
  const remaining = Math.max(total - preview.length, 0);

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-5xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">Distress Feed</Link> /{" "}
          <Link to="/distress-feed/counties" className="hover:text-primary">Coverage</Link> /{" "}
          <Link to="/distress-feed/counties/$state" params={{ state: state.toLowerCase() }} className="hover:text-primary">
            {stateName}
          </Link>{" "}
          / {countyName} County
        </nav>

        <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-foreground">
          {countyName} County, {state} — Probate, Foreclosure & Tax Deed Leads
        </h1>

        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          {[
            { label: "New This Week", value: `+${week.toLocaleString()}` },
            { label: "Total Records", value: total.toLocaleString() },
            { label: "Last Pull", value: formatDate(county?.last_pull_at ?? null) },
            { label: "Record Types", value: String(available.length) },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-surface px-5 py-4">
              <div className="font-mono text-xl font-bold text-foreground">{s.value}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {available.length ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {available.map((t: string) => (
              <span
                key={t}
                className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {recordTypeLabel(t)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
            Most Recent Filings — {countyName} County
          </div>
          {preview.length ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Record</th>
                  <th className="px-5 py-2 font-medium">Filed</th>
                  <th className="px-5 py-2 font-medium">Owner</th>
                  <th className="px-5 py-2 font-medium">City</th>
                  <th className="px-5 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {preview.map((r: FeedPreviewRow, i: number) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-5 py-2 text-foreground">{recordTypeLabel(r.record_type)}</td>
                    <td className="px-5 py-2 text-muted-foreground">{formatDate(r.filed_date)}</td>
                    <td className="px-5 py-2 text-foreground">{r.owner_masked}</td>
                    <td className="px-5 py-2 text-muted-foreground">{r.property_city ?? "—"}</td>
                    <td className="px-5 py-2 text-muted-foreground">{formatAmount(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {countyName} County is queued for coverage. Request it and you will get the first pull the
              morning it lands.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/50 px-5 py-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              {remaining > 0
                ? `+${remaining.toLocaleString()} more leads in ${countyName} County`
                : `Full owner details unlock inside the app`}
            </span>
            <Button asChild>
              <Link to="/start">
                Sign Up To View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {surplus.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Surplus Funds — {countyName} County
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Properties that sold at auction for more than was owed. Amounts are derived from the
              published auction result, not the clerk's official surplus determination.
            </p>
            <SurplusComplianceNotice state={state} className="mt-4" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {surplus.map((r: SurplusCardRecord) => (
                <SurplusRecordCard key={`${r.doc_number}-${r.auction_date ?? ""}`} record={r} />
              ))}
            </div>
          </section>
        ) : null}

        {guides.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-foreground">
              How To Pull These Records Yourself
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {guides.map((g: FeedGuideRow) => (
                <li key={g.record_type}>
                  <Link
                    to="/distress-feed/guides/$state/$county/$recordType"
                    params={{
                      state: state.toLowerCase(),
                      county: countySlug(countyName),
                      recordType: recordTypeById(g.record_type)?.slug ?? g.record_type,
                    }}
                    className="text-primary hover:underline"
                  >
                    {g.title ?? `How to pull ${recordTypeLabel(g.record_type)} records in ${countyName} County`}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {siblings.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-foreground">Nearby Counties In {stateName}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {siblings.map((c: FeedCountyRow) => (
                <Link
                  key={c.county}
                  to="/distress-feed/counties/$state/$county"
                  params={{ state: state.toLowerCase(), county: countySlug(c.county) }}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
                >
                  {c.county} County
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </MarketingLayout>
  );
}
