UPDATE public.source_coverage SET fips = '13139', updated_at = now()
WHERE state = 'GA' AND county_name = 'Hall' AND record_type = 'surplus_funds';