update public.source_coverage sc
set sample_row_count = r.cnt
from (
  select state, county, count(*)::int as cnt
  from public.distress_records
  where record_type = 'surplus_funds'
  group by state, county
) r
where sc.record_type = 'surplus_funds'
  and lower(sc.state) = lower(r.state)
  and lower(coalesce(sc.county_name, '')) = lower(r.county)
  and coalesce(sc.sample_row_count, -1) <> r.cnt;