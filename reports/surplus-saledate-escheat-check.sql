-- ============================================================================
-- Surplus Funds — missing Sale Date + Escheat for Hillsborough & Pasco (FL)
-- Run in Supabase SQL Editor. READ-ONLY. Answers the one question that decides
-- the fix: does the CLERK confirmation carry a sale_date that the view is
-- throwing away, or is there genuinely no sale date anywhere?
--
-- The feed view `surplus_records_visible` derives BOTH sale_date and the escheat
-- countdown ONLY from distress_records.auction_date (r.auction_date). It never
-- reads surplus_confirmations.sale_date (c.sale_date). So a clerk-confirmed row
-- whose derived base row has auction_date = NULL shows "—" in both columns even
-- when the clerk published the sale date.
-- ============================================================================

-- 1) What the FEED currently returns for these two counties. Confirms the
--    symptom: sale_date / escheat_date / days_to_escheat are NULL while the
--    confidence is 'clerk_confirmed'.
SELECT 'feed' AS section, county_name, state_code, case_number, confidence,
       surplus_amount, sale_date, escheat_date, days_to_escheat
FROM public.surplus_records_visible
WHERE state_code = 'FL'
  AND county_name IN ('Hillsborough', 'Pasco')
ORDER BY county_name, surplus_amount DESC
LIMIT 40;

-- 2) THE DECISIVE QUERY. Join the driving derived row to its clerk confirmation
--    and show both dates side by side.
--      has_clerk_sale_date = true  AND auction_date IS NULL
--          -> VIEW BUG. The clerk published the sale date; the view ignores it.
--             Fix = coalesce c.sale_date into the view (migration below).
--      both NULL
--          -> The clerk list genuinely omits a sale date and there is no derived
--             auction date. "—" is HONEST; nothing to display; no code fix.
SELECT 'diagnosis' AS section,
       r.county                         AS county_name,
       r.doc_number                     AS case_number,
       r.auction_date                   AS derived_auction_date,
       c.sale_date                      AS clerk_sale_date,
       (c.sale_date IS NOT NULL)        AS has_clerk_sale_date,
       (r.auction_date IS NULL)         AS derived_date_missing,
       c.confirmed_amount, c.claim_status, c.claim_deadline
FROM public.distress_records r
JOIN public.surplus_confirmations c ON c.derived_record_id = r.id
WHERE r.record_type = 'surplus_funds'
  AND r.state = 'FL'
  AND r.county IN ('Hillsborough', 'Pasco')
ORDER BY r.county, c.confirmed_amount DESC
LIMIT 40;

-- 3) Aggregate counts so you can see how widespread each case is per county.
SELECT 'counts' AS section, r.county AS county_name,
       count(*)                                              AS confirmed_rows,
       count(*) FILTER (WHERE c.sale_date IS NOT NULL)       AS clerk_has_sale_date,
       count(*) FILTER (WHERE r.auction_date IS NOT NULL)    AS derived_has_auction_date,
       count(*) FILTER (WHERE c.sale_date IS NULL
                          AND r.auction_date IS NULL)        AS both_missing
FROM public.distress_records r
JOIN public.surplus_confirmations c ON c.derived_record_id = r.id
WHERE r.record_type = 'surplus_funds'
  AND r.state = 'FL'
  AND r.county IN ('Hillsborough', 'Pasco')
GROUP BY r.county
ORDER BY r.county;
