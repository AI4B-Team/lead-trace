import { Link } from "@tanstack/react-router";
import { Check, ExternalLink } from "lucide-react";
import type {
  SurplusAggregate,
  SurplusCountyRow,
  SurplusFaq,
  SurplusStateRules,
} from "@/lib/surplus/public.server";

export const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Deliberately tiny markdown: paragraphs, bullets, bold, and links. Guide prose
 * is staff-authored, so a full parser buys nothing and adds a dependency.
 */
export function Prose({ children }: { children: string }) {
  const blocks = children.trim().split(/\n{2,}/);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={i} className="text-foreground">{bold[1]}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4"
        >
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

export function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Live totals from clerk-confirmed records only. When nothing is confirmed yet
 * the block says so instead of showing a zero that reads like "no money here".
 */
export function AggregateBlock({
  aggregate,
  scopeLabel,
}: {
  aggregate: SurplusAggregate;
  scopeLabel: string;
}) {
  if (!aggregate.record_count) {
    return (
      <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        We have not yet confirmed any outstanding surplus balances with the clerk in {scopeLabel}.
        The claim process below still applies — start with the official list.
      </div>
    );
  }
  return (
    <div className="rounded-lg border">
      <dl className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Confirmed unclaimed" value={usd0.format(aggregate.total_amount)} />
        <Stat label="Cases" value={aggregate.record_count.toLocaleString()} />
        <Stat
          label={aggregate.county_count === undefined ? "Sale dates" : "Counties"}
          value={
            aggregate.county_count === undefined
              ? [aggregate.min_sale_date, aggregate.max_sale_date].filter(Boolean).join(" – ") ||
                "—"
              : aggregate.county_count.toLocaleString()
          }
        />
      </dl>
      <p className="border-t px-5 py-3 text-xs text-muted-foreground">
        Balances confirmed against clerk records
        {aggregate.data_as_of
          ? `, most recently ${new Date(aggregate.data_as_of).toLocaleDateString("en-US")}`
          : ""}
        . Amounts change as claims are paid.
      </p>
    </div>
  );
}

/**
 * Law at a glance. Rows with unknown values are dropped entirely — an unknown
 * fee cap renders as no row, never as "varies".
 */
export function LawAtAGlance({
  rules,
  stateLabel,
}: {
  rules: SurplusStateRules;
  stateLabel: string;
}) {
  const rows: Array<{ label: string; value: string; cite?: string | null }> = [];

  if (rules.fee_cap_percent !== null) {
    rows.push({
      label: "Recovery fee cap",
      value: `${rules.fee_cap_percent}% of the surplus`,
      cite: rules.fee_cap_citation,
    });
  }
  if (rules.claim_window_days !== null) {
    rows.push({ label: "Time to claim", value: `${rules.claim_window_days} days from the sale` });
  }
  if (rules.escheat_window_days !== null) {
    rows.push({
      label: "Transferred out if unclaimed",
      value: `${rules.escheat_window_days} days after the sale`,
    });
  }
  if (rules.escheat_destination) {
    rows.push({ label: "Unclaimed funds go to", value: rules.escheat_destination });
  }
  if (rules.assignment_permitted !== null) {
    rows.push({
      label: "Assigning your claim",
      value: rules.assignment_permitted
        ? "Permitted, subject to statutory disclosure requirements"
        : "Not permitted",
    });
  }
  rows.push({
    label: "Non-attorney recovery companies",
    value: rules.recovery_permitted
      ? "Permitted"
      : `Barred in ${stateLabel} — only a licensed attorney may recover on your behalf`,
  });

  if (!rows.length) return null;

  return (
    <dl className="divide-y rounded-lg border">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          <dd className="text-sm">
            {row.value}
            {row.cite ? (
              <span className="ml-2 font-mono text-xs text-muted-foreground">{row.cite}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function HowToClaim({
  rules,
  scopeLabel,
  officialListUrl,
  clerkOfficeName,
}: {
  rules: SurplusStateRules;
  scopeLabel: string;
  officialListUrl?: string | null;
  clerkOfficeName?: string | null;
}) {
  const holder = clerkOfficeName ?? `the ${rules.clerk_title} in the county where the property sold`;
  const ownerDate = rules.owner_record_date ?? "the date the foreclosure case was filed";

  const steps: Array<{ title: string; body: React.ReactNode }> = [
    {
      title: "Find the office holding the money",
      body: officialListUrl ? (
        <>
          {holder} publishes its own list of unclaimed funds.{" "}
          <a
            href={officialListUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 underline underline-offset-4"
          >
            Open the official list
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          . That list is the authoritative source — check it before acting on anything you read
          elsewhere, including this page.
        </>
      ) : (
        <>Contact {holder}. That office holds the funds and controls the claim process.</>
      ),
    },
    {
      title: "Confirm you were the owner of record",
      body: `You have a claim if you owned the property on ${ownerDate}. Heirs of a deceased owner can also claim, usually through probate or a small-estate procedure.`,
    },
    {
      title: "Gather your documents",
      body: "Typically a government-issued photo ID, proof of your current address, and the deed or another document showing you held title. Heirs will also need a death certificate and probate paperwork.",
    },
    {
      title: "File before the deadline",
      body:
        rules.escheat_window_days !== null && rules.escheat_destination
          ? `File the claim form with the clerk. ${rules.escheat_window_days} days after the sale, anything still unclaimed is transferred to ${rules.escheat_destination}, and you have to claim it there instead.`
          : "File the claim form with the clerk. Confirm the current deadline with that office — missing it transfers the money out of their hands.",
    },
  ];

  return (
    <>
      <div className="mb-6 rounded-lg border-l-4 border-primary bg-primary/5 p-5">
        <p className="font-medium">
          You do not need an attorney or a recovery company to claim these funds. Filing directly
          with the clerk is free.
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {rules.fee_cap_percent !== null
            ? `If you choose to hire someone, ${scopeLabel} caps what they can charge at ${rules.fee_cap_percent}% of the surplus.`
            : "If you choose to hire someone, read the fee terms carefully before signing."}
        </p>
      </div>

      <ol className="space-y-6">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-medium tabular-nums text-background"
            >
              {i + 1}
            </span>
            <div className="pt-0.5">
              <h3 className="font-medium">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

export function ClaimChecklist({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-sm">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function CountyTable({
  counties,
  stateSlug,
}: {
  counties: SurplusCountyRow[];
  stateSlug: string;
}) {
  if (!counties.length) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        County pages for this state are still being verified.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">County</th>
            <th className="px-4 py-3 font-medium">Clerk Office</th>
            <th className="px-4 py-3 text-right font-medium">Cases</th>
            <th className="px-4 py-3 text-right font-medium">Total Held</th>
            <th className="px-4 py-3 font-medium">Official List</th>
            <th className="px-4 py-3 font-medium">Verified</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {counties.map((c) => (
            <tr key={c.county_fips} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link
                  to="/distress-feed/states/$state/surplus-funds/$county"
                  params={{ state: stateSlug, county: c.county_slug }}
                  className="font-medium underline underline-offset-4"
                >
                  {c.county_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{c.clerk_office_name ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {c.record_count.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{usd0.format(c.total_amount)}</td>
              <td className="px-4 py-3">
                {c.official_list_url ? (
                  <a
                    href={c.official_list_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 underline underline-offset-4"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                {c.verified_at ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FaqList({ faqs }: { faqs: SurplusFaq[] }) {
  if (!faqs.length) return null;
  return (
    <dl className="divide-y rounded-lg border">
      {faqs.map((f) => (
        <div key={f.question} className="px-5 py-5">
          <dt className="font-medium">{f.question}</dt>
          <dd className="mt-2">
            <Prose>{f.answer_md}</Prose>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-12 border-t py-8 text-xs leading-relaxed text-muted-foreground">
      Statutory summaries are research aids, not legal advice. Verify current law and current
      balances with the county clerk or a licensed attorney.
    </p>
  );
}

export function Breadcrumbs({ crumbs }: { crumbs: Array<{ name: string; to: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>/</span> : null}
            {i === crumbs.length - 1 ? (
              <span aria-current="page">{c.name}</span>
            ) : (
              <Link to={c.to} className="hover:underline">
                {c.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Cross-links into the other distress feed record types for the same state. */
export function RelatedRecordTypes({
  stateSlug,
  scopeLabel,
}: {
  stateSlug: string;
  scopeLabel: string;
}) {
  const types = [
    { slug: "pre-foreclosure", label: "Pre-Foreclosure Filings" },
    { slug: "tax-delinquent", label: "Tax Delinquent" },
    { slug: "probate", label: "Probate Filings" },
    { slug: "code-violation", label: "Code Violations" },
  ];
  return (
    <nav aria-label="Related records" className="flex flex-wrap gap-2">
      {types.map((t) => (
        <Link
          key={t.slug}
          to="/distress-feed/states/$state/$recordType"
          params={{ state: stateSlug, recordType: t.slug }}
          className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t.label} in {scopeLabel}
        </Link>
      ))}
      <Link to="/surplus-funds" className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted">
        All Surplus Funds Coverage
      </Link>
    </nav>
  );
}