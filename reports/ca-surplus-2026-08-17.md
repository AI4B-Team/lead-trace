# California excess-proceeds discovery — 2026-08-17 (probe only, nothing promoted)

Script: `scripts/discover-ca-surplus.ts` (roots only, two hops, `links()` + `probe()`
reused from the FL scripts; robots.txt enforced by `politeFetch`).
Machine report: `reports/ca-surplus-2026-08-17.json`.

## Counties that publish a real machine-readable list

| County | Handler | Document | Layout confirmed against the live file |
|---|---|---|---|
| Los Angeles | pdf_list | `EP-Listing-Public-2026A.pdf` (linked from `/notice-of-excess-proceeds/`, filename rotates per auction) | Header reads `Parcel / Item / Purchase Price / Excess Proceeds`. Parsed 133 lines; rows look like `2061-018-063 27 $60,100.00 $47,975.56`. Map: Parcel → `parcel_apn`, Item → `case_number`, Purchase Price → raw, **Excess Proceeds → `confirmed_amount`**. No owner name and no per-row sale date are printed, so `claimant_name`/`sale_date` stay NULL. `$0.00` excess rows carry no money and are dropped by the existing amount gate. |
| Orange | pdf_list | `Excess Proceeds - Internet Auction #1397.pdf` and siblings under `/sites/ttc/files/` | Document located and classified; per-row layout NOT yet read. |
| San Joaquin | pdf_list | `excess-proceeds-march-2026.pdf` (dated filename under a stable folder) | Document located and classified; per-row layout NOT yet read. |

## Ruled out this pass

- **San Diego, Sacramento, Kern, Fresno** — the excess-proceeds page carries claim
  instructions and a claim form only; no parties-of-interest list is published.
  `pickListDocuments` correctly rejected the forms. `records_request` candidates.
- **San Bernardino, Alameda, Contra Costa, Ventura, Sonoma** — reachable, but no
  excess-proceeds link exists on the entry pages crawled.
- **Riverside (`countytreasurer.org`) and Tulare** — HTTP 403 on direct egress;
  **Santa Clara (`tax.sccgov.org`) and Stanislaus** — host unreachable from our
  egress. Proxy widening or the `records_request` path, never a bypass.

## Not done / next

- Only Los Angeles has a human-confirmed column map. Orange and San Joaquin need
  their PDFs read line by line before a `rowPattern` is written.
- No `surplus_sources` rows were seeded and no county was promoted to `live`.
- No `surplus_statutes` row for CA yet. Cal. Rev. & Tax. Code §4674/§4675 must be
  read from current statute text by a human before `published` is set; a claim
  window written from memory is exactly what the guardrails forbid.
- Georgia depth (the 89 counties not covered by the Weissman workbooks) was not
  started this pass.

## Code change

`src/lib/surplus/doc-classify.ts` now recognises `EP-Listing…` as excess-proceeds
wording. Without it, Los Angeles' real listing was rejected while an unrelated
"Tenants Unclaimed Property Inventory" PDF scored as the candidate.
