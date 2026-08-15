UPDATE public.surplus_county_pages
SET county_fips = 'ga-dekalb', updated_at = now()
WHERE state = 'GA' AND slug = 'dekalb';