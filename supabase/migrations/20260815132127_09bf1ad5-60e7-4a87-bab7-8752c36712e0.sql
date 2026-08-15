-- Clerk surplus rows keyed on the parcel alone collided when the same parcel
-- went to tax sale twice (Forsyth GA 263 147: 2021 and 2023). The key now
-- includes the sale date, so existing rows are re-keyed in place rather than
-- re-inserted as duplicates by the next sweep.
UPDATE public.distress_records
SET doc_number = doc_number || '|' || COALESCE(auction_date::text, 'nodate')
WHERE record_type = 'surplus_funds'
  AND raw->>'source' = 'clerk_surplus_list'
  AND parcel_apn IS NOT NULL
  AND doc_number = 'SURP-' || (
    CASE WHEN state IS NOT NULL THEN lower(state) ELSE '' END
  ) || '-' || parcel_apn
  AND doc_number NOT LIKE '%|%';

UPDATE public.distress_records dr
SET doc_number = dr.doc_number || '|' || COALESCE(dr.auction_date::text, 'nodate')
WHERE dr.record_type = 'surplus_funds'
  AND dr.raw->>'source' = 'clerk_surplus_list'
  AND dr.parcel_apn IS NOT NULL
  AND dr.doc_number LIKE '%-' || dr.parcel_apn
  AND dr.doc_number NOT LIKE '%|%';