import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { Button } from "@/components/ui/button";
import { RouteErrorState } from "@/components/route-error";
import { getStateTypePage } from "@/lib/state-guides.functions";
import { canonicalUrl } from "@/lib/seo";
import {
  countySlug,
  formatAmount,
  formatDate,
  recordTypeBySlug,
} from "@/lib/distress-feed.shared";
import {
  carriesAmount,
  LEGAL_DISCLAIMER,
  recordTypeIdForSlug,
  stateName,
  truncate,
  type StateGuideRow,
  type StateTypeStats,
} from "@/lib/state-guides.shared";
import { countiesForState } from "@/lib/us-geo";

export const Route = createFileRoute("/distress-feed/states/$state/$recordType")({
  loader: async ({ params }) => {
    const type = recordTypeBySlug(params.recordType);
    if (!type || params.state.length !== 2) throw notFound();
    const data = await getStateTypePage({
      data: { state: params.state.toUpperCase(), recordTypeSlug: type.slug },
    });
    return { ...data, stateName: stateName(data.state), label: type.label, slug: type.slug };
  },
  head: ({ loaderData }) => {
    const d = loaderData as
      | {
          state: string;
          stateName: string;
          label: string;
          slug: string;
          guide: StateGuideRow | null;
        }
      | undefined;
    if (!d) return { meta: [{ title: "Unavailable" }, { name: "robots", content: "noindex" }] };
    const url = canonicalUrl(`/distress-feed/states/${d.state.toLowerCase()}/${d.slug}`);
    const title = `${d.stateName} ${d.label} Records — County Coverage & How To Pull Them`;

    // PUBLISHED GATE: drafts and missing rows are noindex and self-canonical only.
    if (!d.guide) {
      return {
        meta: [
          { title: `${d.stateName} ${d.label} — Coverage Coming Soon` },
          { name: "robots", content: "noindex" },
        ],
        links: [{ rel: "canonical", href: url }],
      };
    }

    const description = truncate(
      d.guide.intro ??
        `${d.stateName} ${d.label} records: who holds them, what the state calls them, and how to pull them county by county.`,
    );
    return {
      meta: [
        { title: d.guide.title ?? title },
        { name: "description", content: description },
        { property: "og:title", content: d.guide.title ?? title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        ...(d.guide.faqs?.length
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: d.guide.faqs.map((f) => ({
                    "@type": "Question",
                    name: f.question,
                    acceptedAnswer: { "@type": "Answer", text: f.answer },
                  })),
                }),
              },
            ]
          : []),
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Distress Feed",
                item: canonicalUrl("/distress-feed"),
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "States",
                item: canonicalUrl("/distress-feed/states"),
              },
              {
                "@type": "ListItem",
                position: 3,
                name: d.stateName,
                item: canonicalUrl(`/distress-feed/states/${d.state.toLowerCase()}`),
              },
              { "@type": "ListItem", position: 4, name: d.label, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: StateRecordTypePage,
  errorComponent: RouteErrorState,
  notFoundComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground">Page Not Found</h1>
        <Link
          to="/distress-feed/states"
          className="mt-6 inline-block text-sm font-semibold text-primary"
        >
          Browse states
        </Link>
      </div>
    </MarketingLayout>
  ),
});

function Row({ term, value }: { term: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[220px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-foreground">{term}</dt>
      <dd className="text-sm text-muted-foreground">{value}</dd>
    </div>
  );
}

function StateRecordTypePage() {
  const loaded = Route.useLoaderData() as unknown as {
    state: string;
    stateName: string;
    label: string;
    slug: string;
    guide: StateGuideRow | null;
    counties: Array<{ county: string; records: number }>;
    stats: StateTypeStats | null;
    countyGuides: Array<{ county: string }>;
    otherStates: Array<{ state: string; slug: string }>;
  };
  const {
    state,
    stateName: name,
    label,
    slug,
    guide,
    counties,
    stats,
    countyGuides,
    otherStates,
  } = loaded;

  if (!guide) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">
            {name} {label} — Coverage Coming Soon
          </h1>
          <p className="mt-4 text-muted-foreground">
            We don't publish a {name} {label} guide until the county coverage behind it is real.
            Tell us which counties you need and it goes into the build queue.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Link to="/distress-feed/states" className="text-sm font-semibold text-primary">
              Published state guides
            </Link>
            <Link to="/distress-feed" className="text-sm font-semibold text-primary">
              See the Distress Feed
            </Link>
          </div>
        </div>
      </MarketingLayout>
    );
  }

  const g = guide as StateGuideRow;
  const s = stats as StateTypeStats | null;
  const allCounties = countiesForState(state);
  // Coverage here is per record type: a county in the feed for code violations is
  // not "covered" on the probate page.
  const coveredByName = new Map(counties.map((c) => [c.county.toLowerCase(), c] as const));
  const countyGuideByName = new Map(
    countyGuides.map((cg) => [cg.county.toLowerCase(), cg] as const),
  );
  const rows: string[] = (allCounties.length ? allCounties : counties.map((c) => c.county))
    .slice()
    .sort();
  const asOf = formatDate(s?.last_pull_at ?? null);
  const showAmount = carriesAmount(slug) && !!s && s.amount_records > 0 && s.total_amount != null;

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-4xl px-6 py-14">
        <nav className="text-sm text-muted-foreground">
          <Link to="/distress-feed" className="hover:text-primary">
            Distress Feed
          </Link>{" "}
          /{" "}
          <Link to="/distress-feed/states" className="hover:text-primary">
            States
          </Link>{" "}
          /{" "}
          <Link
            to="/distress-feed/states/$state"
            params={{ state: state.toLowerCase() }}
            className="hover:text-primary"
          >
            {name}
          </Link>{" "}
          / {label}
        </nav>

        {/* 1 — H1 and coverage lede */}
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-foreground">
          {name} {label}
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          <strong className="text-foreground">
            LeadTrace tracks {(s?.counties_covered ?? 0).toLocaleString()} of{" "}
            {(allCounties.length || counties.length).toLocaleString()} {name} counties for {label}.
          </strong>{" "}
          {g.intro}
        </p>

        {/* 2 — By the numbers (live) */}
        {s && s.records > 0 ? (
          <section className="mt-10 rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-2xl font-bold text-foreground">By The Numbers</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Counties Covered
                </dt>
                <dd className="font-mono text-2xl font-bold text-foreground">
                  {s.counties_covered.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Records Tracked
                </dt>
                <dd className="font-mono text-2xl font-bold text-foreground">
                  {s.records.toLocaleString()}
                </dd>
              </div>
              {s.latest_filed ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Most Recent Record
                  </dt>
                  <dd className="font-mono text-2xl font-bold text-foreground">
                    {formatDate(s.latest_filed)}
                  </dd>
                </div>
              ) : null}
              {showAmount ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Dollar Volume
                  </dt>
                  <dd className="font-mono text-2xl font-bold text-foreground">
                    {formatAmount(s.total_amount)}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-4 font-mono text-xs text-muted-foreground">as of {asOf}</p>
          </section>
        ) : null}

        {/* 3 — Law at a glance */}
        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold text-foreground">Law At A Glance</h2>
          <dl className="mt-4">
            <Row term="Sale Type" value={g.law_sale_type} />
            <Row term="Who Holds The Records" value={g.law_records_holder} />
            <Row term="Claim Window" value={g.law_claim_window} />
            <Row term="Local Terminology" value={g.law_local_terminology} />
            <Row term="Public Records Statute" value={g.law_public_records_statute} />
            <Row term="Notes" value={g.law_notes} />
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">{LEGAL_DISCLAIMER}</p>
        </section>

        {/* 4 — County table, every county in the state */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-foreground">
            {name} Coverage By County
          </h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">County</th>
                  <th className="px-4 py-3">Coverage</th>
                  <th className="px-4 py-3 text-right">Records</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((county) => {
                  const match = coveredByName.get(county.toLowerCase());
                  return (
                    <tr key={county} className="border-t border-border">
                      <td className="px-4 py-2 text-foreground">
                        {match ? (
                          <Link
                            to="/distress-feed/counties/$state/$county"
                            params={{ state: state.toLowerCase(), county: countySlug(county) }}
                            className="font-semibold text-primary hover:underline"
                          >
                            {county} County
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{county} County</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {match ? "Covered" : "Not yet covered"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                        {match ? Number(match.records).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-xs text-muted-foreground">as of {asOf}</p>
        </section>

        {/* 5 — How to pull it yourself */}
        {g.steps.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-foreground">
              How To Pull It Yourself
            </h2>
            <ol className="mt-5 space-y-6">
              {g.steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    {step.heading ? (
                      <h3 className="font-display font-bold text-foreground">{step.heading}</h3>
                    ) : null}
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            {countyGuideByName.size ? (
              <div className="mt-6 rounded-2xl border border-border bg-surface-muted p-5">
                <h3 className="font-display font-bold text-foreground">
                  County-Specific Walkthroughs
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...countyGuideByName.values()].map((cg) => (
                    <Link
                      key={cg.county}
                      to="/distress-feed/guides/$state/$county/$recordType"
                      params={{
                        state: state.toLowerCase(),
                        county: countySlug(cg.county),
                        recordType: slug,
                      }}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-primary hover:border-primary"
                    >
                      {cg.county} County
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* 6 — CTA */}
        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-display text-xl font-bold text-foreground">Skip The Manual Work</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            LeadTrace pulls {name} {label} nightly — deduped, enriched, DNC scrubbed and skip
            traced, ready to text.
          </p>
          <Button asChild className="mt-4">
            <Link to="/distress-feed">
              See the Distress Feed <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* 7 — Prose */}
        {g.what_is_body ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-foreground">What Is {label}?</h2>
            <p className="mt-3 text-muted-foreground">{g.what_is_body}</p>
          </section>
        ) : null}
        {g.how_pros_use_body ? (
          <section className="mt-8">
            <h2 className="font-display text-2xl font-bold text-foreground">
              How Professionals Use It
            </h2>
            <p className="mt-3 text-muted-foreground">{g.how_pros_use_body}</p>
          </section>
        ) : null}

        {/* 8 — FAQ */}
        {g.faqs.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-foreground">Frequently Asked</h2>
            <div className="mt-4 space-y-4">
              {g.faqs.map((f, i) => (
                <div key={i} className="rounded-2xl border border-border bg-surface p-5">
                  <h3 className="font-display font-bold text-foreground">{f.question}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 9 — Other states */}
        {otherStates.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-foreground">
              {label} In Other States
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {otherStates.map((o) => (
                <Link
                  key={o.state}
                  to="/distress-feed/states/$state/$recordType"
                  params={{ state: o.state.toLowerCase(), recordType: o.slug }}
                  className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-primary hover:border-primary"
                >
                  {stateName(o.state)}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* 10 — Footer disclaimer */}
        <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          Counts and dates on this page are generated from our live coverage database as of {asOf}.{" "}
          {LEGAL_DISCLAIMER} Last reviewed {formatDate(g.updated_at)}.
        </p>
      </article>
    </MarketingLayout>
  );
}
