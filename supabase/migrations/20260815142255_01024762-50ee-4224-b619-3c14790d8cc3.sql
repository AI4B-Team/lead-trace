-- The public surplus view joins guide pages to records on the records' county key,
-- which uses the 'ga-<slug>' form everywhere in this dataset. Five recent Georgia
-- pages were registered with numeric FIPS instead, so they joined nothing and
-- rendered with no totals despite having live ingested rows. Normalize them.
UPDATE public.surplus_county_pages
SET county_fips = lower(state) || '-' || slug
WHERE state = 'GA' AND county_fips ~ '^[0-9]+$';