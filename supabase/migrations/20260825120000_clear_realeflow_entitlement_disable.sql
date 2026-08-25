-- RealeFlow fixed the PRE_FORECLOSURE / RECENTLY_DELINQUENT lead-type
-- validation bug (Tyler, 2026-08-24) and we verified both return rows on the
-- production account (2026-08-25). The sourcing sweep permanently skips any
-- record type that was ever refused with an entitlement error (data_sources
-- rows with dataset_id 'entitlement:<type>' and status 'disabled'), so those
-- markers must be cleared for the newly enabled configs to actually run.
-- Idempotent: deleting rows that do not exist is a no-op.
DELETE FROM public.data_sources
WHERE platform = 'realeflow'
  AND status = 'disabled'
  AND dataset_id IN ('entitlement:pre_foreclosure', 'entitlement:tax_delinquent');
