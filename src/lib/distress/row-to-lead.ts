// ---------------------------------------------------------------------------
// One mapping from a distress_records row to a RawLead. Both read paths (the
// Distress Feed pull and the List Builder's records fallback) call this, so the
// two can never drift on field names or source_meta shape.
// ---------------------------------------------------------------------------

import type { RawLead } from "../data-providers";

export const DISTRESS_ROW_COLUMNS =
  "id, state, county, fips, record_type, doc_number, filed_date, owner_first, owner_last, company_entity, property_address, property_city, property_state, property_zip, mailing_address, mailing_city, mailing_state, mailing_zip, amount, surplus_amount, surplus_basis, auction_date, status, parcel_apn, source_url";

export type DistressRow = Record<string, string | number | null | undefined>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function distressRowToLead(r: DistressRow): RawLead {
  return {
    full_name: [r.owner_first, r.owner_last].filter(Boolean).join(" ") || null,
    business_name: str(r.company_entity),
    phone: null,
    email: null,
    address: str(r.property_address),
    city: str(r.property_city),
    state: str(r.property_state) ?? str(r.state),
    zip: str(r.property_zip),
    source_meta: {
      source: "distress_feed",
      record_type: r.record_type ?? null,
      doc_number: r.doc_number ?? null,
      filed_date: r.filed_date ?? null,
      county: r.county ?? null,
      fips: r.fips ?? null,
      amount: r.amount ?? null,
      surplus_amount: r.surplus_amount ?? null,
      surplus_basis: r.surplus_basis ?? null,
      auction_date: r.auction_date ?? null,
      case_status: r.status ?? null,
      parcel_apn: r.parcel_apn ?? null,
      mailing_address: r.mailing_address ?? null,
      mailing_city: r.mailing_city ?? null,
      mailing_state: r.mailing_state ?? null,
      mailing_zip: r.mailing_zip ?? null,
      source_url: r.source_url ?? null,
    },
  } as RawLead;
}
