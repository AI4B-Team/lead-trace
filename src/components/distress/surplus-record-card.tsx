import { formatAmount, formatDate } from "@/lib/distress-feed.shared";
import { surplusBasisLabel } from "@/lib/distress/surplus";
import { confirmationFreshness, isClosedClaim } from "@/lib/surplus/freshness";

export type SurplusCardRecord = {
  doc_number: string;
  auction_date: string | null;
  surplus_amount: number | null;
  surplus_basis: string | null;
  sold_to: string | null;
  estimated: boolean;
  property_address?: string | null;
  property_city?: string | null;
  property_zip?: string | null;
  owner_masked?: string | null;
  confirmed_amount?: number | null;
  confirmed_as_of?: string | null;
  claim_deadline?: string | null;
  deadline_from_clerk?: boolean | null;
  claim_status?: string | null;
  variance_pct?: number | null;
  confirmation_source_url?: string | null;
  source_status?: string | null;
};

const CLAIM_STATUS_LABEL: Record<string, string> = {
  unclaimed: "Unclaimed",
  claim_filed: "Claim Filed",
  disbursed: "Disbursed",
  escheated: "Escheated",
  unknown: "Status Unknown",
};

/**
 * One surplus record.
 *
 * Two amounts can exist and they are never merged. "Clerk confirmed" is the
 * county's own figure with the date we read it; "Estimated" is computed from the
 * auction result. When both exist and disagree materially, both are shown —
 * hiding the gap would be the dishonest choice.
 */
export function SurplusRecordCard({ record }: { record: SurplusCardRecord }) {
  const place =
    record.property_address ??
    [record.property_city, record.property_zip].filter(Boolean).join(", ") ??
    null;

  const confirmed = typeof record.confirmed_amount === "number" && record.confirmed_amount > 0;
  const headline = confirmed ? record.confirmed_amount! : record.surplus_amount;
  const freshness = confirmed
    ? confirmationFreshness({
        confirmedAsOf: record.confirmed_as_of,
        sourceStatus: record.source_status,
        sourceLastSuccessAt: record.confirmed_as_of,
      })
    : null;
  const variance =
    confirmed && typeof record.variance_pct === "number" && record.variance_pct > 5
      ? record.variance_pct
      : null;
  const closed = isClosedClaim(record.claim_status);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-2xl font-bold text-foreground">{formatAmount(headline)}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            Surplus Over {surplusBasisLabel(record.surplus_basis)}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            confirmed
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-surface-muted text-muted-foreground"
          }`}
        >
          {confirmed ? "Clerk Confirmed" : "Estimated"}
        </span>
      </div>

      {freshness ? (
        <div
          className={`mt-3 text-[11px] font-medium ${
            freshness.state === "fresh" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {freshness.label}
        </div>
      ) : null}

      {variance != null ? (
        <div className="mt-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-[11px] text-muted-foreground">
          Clerk figure differs from our auction-derived estimate of{" "}
          <span className="font-mono">{formatAmount(record.surplus_amount)}</span> by{" "}
          {variance.toFixed(1)}%. The clerk figure governs.
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field label="Sale Date" value={formatDate(record.auction_date)} />
        <Field label="Sold To" value={record.sold_to ?? "—"} />
        <Field label="Case Number" value={record.doc_number || "—"} mono />
        <Field label="Property" value={place || "—"} />
        {record.owner_masked ? <Field label="Owner" value={record.owner_masked} /> : null}
        {confirmed ? (
          <Field label="Claim Status" value={CLAIM_STATUS_LABEL[record.claim_status ?? "unknown"]!} />
        ) : null}
        {record.claim_deadline ? (
          <Field
            label={record.deadline_from_clerk ? "Deadline (Clerk)" : "Deadline (Statute)"}
            value={formatDate(record.claim_deadline)}
          />
        ) : confirmed ? (
          <Field label="Claim Deadline" value="Not verified for this state" />
        ) : null}
      </dl>

      {closed ? (
        <div className="mt-3 text-[11px] font-medium text-muted-foreground">
          No longer an active claim — kept for reference.
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
