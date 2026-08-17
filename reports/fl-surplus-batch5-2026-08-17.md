# FL surplus batch 5 (2026-08-17)

Probe: `bun run scripts/discover-fl-surplus-batch5.ts` → `reports/fl-surplus-batch5.json`.
20 counties not covered by batches 2-4. 3 flagged OK by the probe; only 1 survived
human column confirmation.

| County | Probe | Verdict |
|---|---|---|
| Santa Rosa | pdf_list | **PROMOTED live.** Clerk "Tax Deed Surplus" PDF: 19 rows, 0 unmatched, $270,673.75 held. |
| Manatee | pdf_list (`unclaimed-funds-2026.pdf`) | Rejected as a surplus source: that PDF is the Ch. 717 / 116.21 unclaimed-checks list (jury checks, recording fees, $15 items), not tax deed surplus. Manatee's real tax-deed surplus table is already live as `html_table`. |
| Osceola | html_table | False positive — the "table" is the site nav plus claim-form prose; the only docs are claim forms. Osceola's real surplus PDF is already live as `pdf_list`. |

No list published (claim instructions only): Brevard, Volusia, Sumter, Martin, Citrus,
Hernando, St. Johns, Marion landing page, Putnam. Blocked/unreachable: Sarasota (403),
Flagler (403), Lake (403), Escambia (403), Monroe (TLS chain), Indian River (bad host),
Highlands (404 sitemap), Lee (504). All of these already sit on the `records_request`
path (or are live via another handler), so nothing new was created for them — no source
that ingests nothing, and no specimen figures mapped from a claim form.

## Santa Rosa confirmed mapping

Landing page (stable): https://santarosaclerk.com/foreclosures-tax-deeds/ —
`resolveLatestFrom` + `linkMatch: "tax.?deed.?surplus"`, because the filename embeds a
revision date and rotates.

`FILE#` → `case_number`, `SURPLUS` → `confirmed_amount`, `SALE DATE` → `sale_date`,
`PAYEE`+mailing address → `claimant_name`. The printed address is the **payee mailing
address, not the property**, so `property_address` and `parcel_apn` stay null rather than
carrying a wrong address. Long payees wrap onto a second line; `joinPattern` rejoins them.

Ingest through the real handler path: parsed 19 / with amount 19 / **written 19**, 0 dupes.
FL rows now come from Marion, Osceola, Manatee, Hillsborough and Santa Rosa.
