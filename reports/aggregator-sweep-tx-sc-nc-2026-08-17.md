# Surplus aggregator sweep — TX / SC / NC (2026-08-17)

Goal: repeat the Georgia win (one firm index -> many counties, one confirmed
layout) in Texas, South Carolina and North Carolina.

Outcome: **no aggregator qualifies in any of the three states.** Nothing was
promoted; `surplus_sources` is unchanged. The generalized probe
(`scripts/discover-aggregators.ts`) now supports xlsx / pdf / html firm indexes,
and every candidate checked is recorded in its `RULED_OUT` list so a later sweep
does not repeat the work.

## Texas
- Tax-law firms that serve most Texas counties (Linebarger, Perdue Brandon,
  MVBA) publish **sale schedules only**. Excess proceeds are paid into the court
  and held by the district clerk, so no firm holds the money list.
- Paid "overages list" SaaS sites are lead-gen paywalls, not a records holder.
- Real lead: Tyler **Odyssey** district-clerk reports use one shared layout
  across counties — `Orig Receipt Date | Case Number | Style | Ending Balance |
  Payor | Court Location | Comment` — at
  `odysseyreport.<county>tx.gov/District_Clerk/ExcessProceedsFromTaxSale.pdf`.
  Blocked: direct TCP times out on :80 and :443 for ~100 host variants
  (including the known-good Fort Bend URL) while control hosts answer fine, and
  the residential proxy gets a flat `403`. Unretrievable = unverifiable, so no
  county was seeded.

## South Carolina
- No multi-county aggregator. Statewide associations host directories only;
  overages are held per county by the delinquent tax collector.
- Orangeburg County publishes a genuine machine-readable overage list
  (sample row $1,422.54) but the host answers our bot UA with a Cloudflare
  managed challenge.

## North Carolina
- No multi-county aggregator. Tax-foreclosure firms (Zacchaeus, Kania) publish
  no surplus tables; surplus sits with each Clerk of Superior Court under a
  separate special proceeding, with no shared index or layout.

## What did land
Verified statute gates were added to `surplus_statutes` (both `published = false`
until a county source in that state goes live):

| State | Citation | Claim window | Escheat | Unclaimed money goes to |
| --- | --- | --- | --- | --- |
| TX | Tex. Tax Code 34.03, 34.04 | petition before the 2nd anniversary of the sale (730d) | 730d from sale | taxing units, pro rata (NOT state unclaimed property) |
| SC | S.C. Code 12-51-130 | payable 90d after deed execution | 5 years (1825d) from the auction | general fund of the county/municipal governing body |

Fee caps are `null` in both: neither statute sets one, and a guessed cap is worse
than a gap. NC has **no** statute row — every text source for
`N.C.G.S. 1-339.71` was bot-blocked from here, so the citation stays unrecorded
rather than written from memory.

## Next step that would actually unblock volume
Both remaining leads are network blocks, not data gaps: Texas Odyssey PDFs and
the SC clerk hosts. Either widen `PROXY_EXTRA_HOSTS` to those clerk hostnames
with a proxy egress they accept, or route them through the existing
`records_request` email path already used for the 23 crawl-blocked FL counties.
