insert into public.source_coverage (state, county_name, record_type, fips, status, sample_row_count, last_success_at, verified_at)
select 'FL','Osceola','surplus_funds','12097','verified',
  (select count(*) from public.distress_records where record_type='surplus_funds' and state='FL' and county='Osceola'),
  now(), now()
where not exists (
  select 1 from public.source_coverage
  where state='FL' and county_name ilike 'Osceola' and record_type='surplus_funds'
);