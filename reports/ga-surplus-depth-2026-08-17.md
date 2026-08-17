# Georgia depth probe — 2026-08-17

Ran `scripts/discover-ga-surplus-depth.ts` over 30 uncovered GA counties
(largest first). 71 GA counties already have a `surplus_sources` row from the
Weissman aggregator + earlier direct work; these are the ones outside it.

Result: **0 new machine-readable held-funds lists.** Nothing promoted, nothing
written to the DB.

Why each county missed:
- Reachable homepage/sitemap but no excess-funds link (16): Chatham, Richmond,
  Bibb, Paulding, Coweta, Carroll, Glynn, Camden, Walton, Dougherty, Rockdale,
  Lumpkin, Butts, Upson, Haralson, Madison/Chattooga (see JSON).
  In Georgia the funds sit with the Tax Commissioner, and most of these counties
  run that office on a third-party portal (GovtWindow / itsyourmoney style) that
  is not linked from the county homepage or sitemap.
- Blocks automation — 403/406 (6): Houston, Whitfield, Bartow, Catoosa, Tift,
  Colquitt.
- DNS/TLS unreachable from this egress (5): Floyd, Ware, Laurens, Elbert, Monroe.
- 404 on both roots (2): Fayette, Hart.

Next lever for GA depth (not run here): enumerate the shared Tax Commissioner
portal host directly the way weissman.law was enumerated — one source, many
counties — rather than county-by-county homepages.

Raw probes: `reports/ga-surplus-depth.json`.
