import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ConfidenceBadge, EscheatCountdown } from "./indicators";
import { SurplusComplianceNotice } from "@/components/distress/surplus-compliance-notice";
import {
  currency,
  formatFeedDate,
  DISBURSEMENT_LABELS,
  SALE_TYPE_LABELS,
  type SurplusFeedRecord,
} from "@/lib/surplus/feed.shared";

export function SurplusDetailPanel({
  record,
  onOpenChange,
}: {
  record: SurplusFeedRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!record} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {record ? <PanelBody record={record} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({ record }: { record: SurplusFeedRecord }) {
  return (
    <>
      <SheetHeader className="space-y-1 text-left">
        <SheetTitle className="text-lg">
          {record.property_address ?? "Address Not Published"}
        </SheetTitle>
        <SheetDescription>
          {record.county_name ? `${record.county_name}, ` : ""}
          {record.state_code}
          {record.case_number ? ` · ${record.case_number}` : ""}
        </SheetDescription>
        <div className="flex items-center gap-2 pt-2">
          <ConfidenceBadge confidence={record.confidence} sourceUrl={record.source_url} />
          <EscheatCountdown
            days={record.days_to_escheat}
            escheatDate={record.escheat_date}
            destination={record.escheat_destination}
          />
        </div>
      </SheetHeader>

      <Section title="Sale">
        <Row label="Owner Of Record" value={record.owner_of_record ?? "—"} />
        <Row label="Parcel ID" value={record.parcel_id ?? "—"} />
        <Row label="Sale Type" value={SALE_TYPE_LABELS[record.sale_type] ?? record.sale_type} />
        <Row label="Sale Date" value={formatFeedDate(record.sale_date)} />
      </Section>

      <Section title="Bid Stack">
        <Row label="Opening Bid" value={money(record.opening_bid)} />
        <Row label="Judgment Amount" value={money(record.judgment_amount)} />
        <Row label="Winning Bid" value={money(record.winning_bid)} />
        <Row label="Surplus" value={currency.format(record.surplus_amount)} emphasis />
        <Row
          label="Basis"
          value={
            record.surplus_basis === "derived"
              ? "Derived From Auction Result"
              : "Clerk's Published Amount"
          }
        />
        {record.variance_pct != null && record.variance_pct > 5 ? (
          <Row
            label="Variance"
            value={`${record.variance_pct.toFixed(1)}% vs Derived Amount`}
          />
        ) : null}
      </Section>

      <Section title="Claim">
        <Row label="Disbursement Status" value={DISBURSEMENT_LABELS[record.disbursement_status ?? "unknown"] ?? "Status Unknown"} />
        <Row
          label="Claim Deadline"
          value={
            record.claim_deadline
              ? `${formatFeedDate(record.claim_deadline)}${record.deadline_from_clerk ? " (Clerk)" : " (Statute)"}`
              : "Not Published"
          }
        />
        <Row label="Escheat Date" value={formatFeedDate(record.escheat_date)} />
        <Row label="Escheats To" value={record.escheat_destination ?? "—"} />
        <Row
          label="Fee Cap"
          value={
            record.fee_cap_percent != null
              ? `${record.fee_cap_percent}%${record.fee_cap_citation ? ` · ${record.fee_cap_citation}` : ""}`
              : "No Published Cap"
          }
        />
        <Row
          label="Assignment Permitted"
          value={
            record.assignment_permitted == null
              ? "Unknown"
              : record.assignment_permitted
                ? "Yes"
                : "No"
          }
        />
      </Section>

      <Section title="Provenance">
        <Row label="Source" value={record.source_registry === "clerk" ? "County Clerk" : "Auction Result"} />
        <Row label="First Seen" value={formatFeedDate(record.first_seen_at)} />
        <Row label="Clerk Confirmed" value={formatFeedDate(record.confirmed_at)} />
        {record.source_url ? (
          <a
            href={record.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Open Source Record
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </Section>

      <div className="pt-4">
        <SurplusComplianceNotice state={record.state_code} />
      </div>
    </>
  );
}

function money(v: number | null): string {
  return v == null ? "—" : currency.format(v);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <Separator className="my-2" />
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasis ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}