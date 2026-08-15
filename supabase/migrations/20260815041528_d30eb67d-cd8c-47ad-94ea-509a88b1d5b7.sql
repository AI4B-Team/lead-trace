update public.source_coverage sc
set sample_row_count = r.cnt
from (
  select fips, count(*)::int as cnt
  from public.distress_records
  where record_type = 'surplus_funds'
  group by fips
) r
where sc.record_type = 'surplus_funds'
  and sc.fips = r.fips
  and coalesce(sc.sample_row_count, -1) <> r.cnt;