create extension if not exists pg_trgm;

alter table public.surplus_statutes
  add column if not exists published boolean not null default false,
  add column if not exists escheat_days integer,
  add column if not exists escheat_starts_from text,
  add column if not exists escheat_destination text,
  add column if not exists recovery_permitted boolean not null default true,
  add column if not exists assignment_permitted boolean;

-- Only a human-verified statute row may drive a customer-facing countdown.
update public.surplus_statutes set published = true where verified_at is not null;

-- Florida: unclaimed surplus is remitted to the state after 120 days (Fla. Stat. 45.032/197.582).
update public.surplus_statutes
   set escheat_days = coalesce(escheat_days, 120),
       escheat_starts_from = coalesce(escheat_starts_from, 'sale_date'),
       escheat_destination = coalesce(escheat_destination, 'Florida Department of Financial Services (Unclaimed Property)'),
       assignment_permitted = coalesce(assignment_permitted, true)
 where state = 'FL';

create or replace view public.surplus_records_visible as
select
  r.id,
  c.workspace_id,
  r.fips                                  as county_fips,
  r.county                                as county_name,
  r.state                                 as state_code,
  r.doc_number                            as case_number,
  case when r.surplus_basis = 'opening_bid' then 'tax_deed' else 'mortgage_foreclosure' end as sale_type,
  r.property_address,
  r.property_city,
  r.property_zip,
  r.parcel_apn                            as parcel_id,
  nullif(trim(coalesce(r.company_entity, concat_ws(' ', r.owner_first, r.owner_last))), '') as owner_of_record,
  r.auction_date                          as sale_date,
  case when r.surplus_basis = 'opening_bid' then r.amount end   as opening_bid,
  case when r.surplus_basis = 'final_judgment' then r.amount end as judgment_amount,
  case when r.amount is not null and r.surplus_amount is not null then r.amount + r.surplus_amount end as winning_bid,
  coalesce(c.confirmed_amount, r.surplus_amount)::numeric as surplus_amount,
  case when c.confirmed_amount is not null then 'clerk_published' else 'derived' end as surplus_basis,
  case when c.confirmed_amount is not null then 'clerk_confirmed' else 'derived' end as confidence,
  c.variance_pct,
  case when c.id is not null then 'clerk' else 'auction' end as source_registry,
  coalesce(c.source_url, r.source_url)    as source_url,
  coalesce(c.claim_status, 'unknown')     as disbursement_status,
  c.claim_deadline,
  c.deadline_from_clerk,
  case
    when s.escheat_days is null or r.auction_date is null then null
    else (r.auction_date + s.escheat_days)
  end                                     as escheat_date,
  case
    when s.escheat_days is null or r.auction_date is null then null
    else ((r.auction_date + s.escheat_days) - current_date)::int
  end                                     as days_to_escheat,
  s.fee_cap_pct                           as fee_cap_percent,
  s.statute_citation                      as fee_cap_citation,
  s.escheat_destination,
  s.recovery_permitted,
  s.assignment_permitted,
  r.created_at                            as first_seen_at,
  c.confirmed_as_of                       as confirmed_at
from public.distress_records r
join public.surplus_statutes s
  on s.state = r.state
 and s.published = true
 and s.sale_kind = case when r.surplus_basis = 'opening_bid' then 'tax_deed' else 'foreclosure' end
left join public.surplus_confirmations c
  on c.derived_record_id = r.id
where r.record_type = 'surplus_funds'
  and r.surplus_amount is not null;

comment on view public.surplus_records_visible is
  'Customer-facing surplus records. Excludes states whose statute rules are unpublished. days_to_escheat is null where the state defines no escheat window. Read server-side only.';

revoke all on public.surplus_records_visible from anon, authenticated;
grant select on public.surplus_records_visible to service_role;

create index if not exists distress_records_surplus_amount_idx
  on public.distress_records (surplus_amount desc) where record_type = 'surplus_funds';
create index if not exists distress_records_surplus_date_idx
  on public.distress_records (auction_date desc) where record_type = 'surplus_funds';