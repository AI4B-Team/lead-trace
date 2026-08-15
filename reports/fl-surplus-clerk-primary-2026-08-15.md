# Florida clerk-primary surplus: batch 3 probe

Counties probed with the real page paths recovered from each clerk's own
homepage (batch 2 guessed URLs and got 404s).

| County | Page reachable | Publishes rows? | Detail |
|---|---|---|---|
| Clay | yes | no | "Unclaimed Funds List" PDF is a **single embedded image** (1 page, 771x496 screenshot). No extractable text beyond the title. Not machine-readable; OCR of dollar figures is not acceptable for customer-facing amounts. |
| St. Lucie | yes | no | Only document is `Unclaimed-Monies-Affidavit.pdf` — a claim form, not a list. |
| Collier | no | — | Both paths time out (>25s) from this network. |
| Charlotte | yes | no | Department page has no list; `taxdeeds.charlotteclerk.com` is robots-disallowed. |
| Bay | yes | no | Only document is `Claim-to-Surplus-Proceeds_ada.pdf` — a claim form. |
| Nassau | yes | no | Tax deed pages carry sale notices only. |
| Okaloosa | yes | no | Mentions surplus, publishes claim instructions only. |

Result: **0 of 7 counties publish a machine-readable held-surplus list.**

## Code changes from this probe

- `src/lib/surplus/doc-classify.ts` — separates a published list from claim
  paperwork by filename. Batch 2/3 previously scored
  `Claim-to-Surplus-Proceeds_ada.pdf` and `Unclaimed-Monies-Affidavit.pdf` as
  "candidate list" purely because the name contains "surplus"/"unclaimed",
  which would have created sources that ingest nothing or, worse, map specimen
  figures from a form.
- Per-request deadlines in the batch scripts. Collier accepted the connection
  and never replied, stalling the whole sweep indefinitely.

## What this leaves

For these counties the remaining honest path is the records-request handler
(clerk emails a spreadsheet), which sidesteps both WAFs and robots. Scraping
cannot produce data that the clerk does not publish as data.
