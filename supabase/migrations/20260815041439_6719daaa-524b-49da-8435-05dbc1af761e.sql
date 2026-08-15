update public.source_coverage sc
set last_success_at = ss.last_success_at, status = 'verified'
from public.surplus_sources ss
where sc.record_type = 'surplus_funds'
  and sc.state = ss.state
  and lower(sc.county_name) = lower(ss.county_name)
  and ss.last_success_at is not null;