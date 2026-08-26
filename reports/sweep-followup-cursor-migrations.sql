-- Follow-up (single statement): the one-shot check showed (1) no B/C rows —
-- the 09:40 UTC tick never attempted the new lead types, and (2) no D row —
-- sourcing_cursors is EMPTY, so the sweep restarts at county #1 every night
-- (Bradford/Brevard/Broward = the first slice). This digs into both.
SELECT * FROM (

  -- 1) Does the cursor table have ANY rows at all? (count row always appears)
  SELECT 'cursor-table' AS chk,
         'total rows: ' || COUNT(*) AS detail,
         COALESCE(string_agg(key || ' pos=' || position || ' cycles=' || cycles, '; '), '(TABLE IS EMPTY)') AS info,
         MAX(updated_at) AS at
  FROM public.sourcing_cursors

  UNION ALL

  -- 2) Were our two recent migrations applied to THIS database?
  --    Expect two rows: 20260824120000 (seed cursor), 20260825120000 (clear markers).
  SELECT 'migration-applied',
         version,
         COALESCE(name, ''),
         NULL::timestamptz
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260824120000', '20260825120000')

  UNION ALL

  -- 3) The FULL list of pulls from this morning's tick (no LIMIT this time):
  --    which counties + which record types actually ran?
  SELECT 'tick-pulls',
         county || ' / ' || record_type,
         status || ' found=' || records_found || ' added=' || records_added,
         started_at
  FROM public.distress_pulls
  WHERE started_at > now() - interval '36 hours'

) x
ORDER BY chk, at NULLS FIRST;
