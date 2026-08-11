import { formatAmount, formatDate } from "@/lib/distress-feed.shared";
import { surplusBasisLabel } from "@/lib/distress/surplus";

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
};

/**
 * One surplus record. The "Estimated" chip is not decoration: the amount is
 * computed from the auction result (sold price minus the baseline owed), not
 * the clerk's official surplus determination.
 */
export function SurplusRecordCard({ record }: { record: SurplusCardRecord }) {
  const place =
    record.property_address ??
    [record.property_city, record.property_zip].filter(Boolean).join(", ") ??
    null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-2xl font-bold text-foreground">
            {formatAmount(record.surplus_amount)}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            Surplus Over {surplusBasisLabel(record.surplus_basis)}
          </div>
        </div>
        {record.estimated ? (
          <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Estimated
          </span>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field label="Sale Date" value={formatDate(record.auction_date)} />
        <Field label="Sold To" value={record.sold_to ?? "—"} />
        <Field label="Case Number" value={record.doc_number || "—"} mono />
        <Field label="Property" value={place || "—"} />
        {record.owner_masked ? <Field label="Owner" value={record.owner_masked} /> : null}
      </dl>
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
