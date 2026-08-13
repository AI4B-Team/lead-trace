# Surplus Funds sourcing — county probe findings (2026-08-13)

Boss asked (via two Claude threads) to add a **surplus_funds** record type to
the Distress Feed. Surplus funds = the leftover money after a tax-deed /
foreclosure auction sells a property for more than the debt owed; the county
clerk holds it for the former owner until it escheats to the state.

Key constraints established:
- **NOT a RealeFlow type.** Surplus lists live on county clerk / tax
  commissioner sites (PDF/HTML), not the RealeFlow Partner API.
- **RealAuction is out.** Every RealAuction host's robots.txt is `disallow: /`
  (see BOSS-UPDATE-realeflow-sourcing.md), so the Phase-1 "derive from
  RealAuction sale results" idea in the Claude thread is not available to us.
  We must source the clerk's OWN published surplus list directly.
- Claude's own guidance: **do NOT write one scraper per county** — use a
  `surplus_sources` config table + a small set of handlers
  (`html_table | pdf_list | realauction_tab | open_data | records_request`).

## Probe method

Real headless browser (Playwright/Chromium) because clerk sites 403 plain
bots. Opened known clerk tax-deed / unclaimed-funds pages, looked for a
surplus/unclaimed/excess list and its format. Scripts (repo root, temporary):
`probe_clerks.py`, `probe_lists.py`, `read_marion_pdf.py`.

## Result — two clean FL sources confirmed

### 1. Marion County (fips 12083) — BEST, VERIFIED END-TO-END ✅
- Page: marioncountyclerk.org → Tax Deeds → Unclaimed Funds
- File: `.../uploads/2026/08/Copy-of-Tax-Deeds-Surplus-Funds-2026-08-07.pdf`
  (dated filename → refreshed regularly)
- Format: **PDF**, 11 pages, machine-readable text (pdfplumber extracts cleanly).
- Columns: **Sale number | Sale date | Tax number | Parcel number | Current balance**
  - e.g. `295336  2022-08-17  83442014  1814-026-017  5,778.69`
- Note: this list carries parcel + surplus $ but NOT owner name; owner comes
  from a parcel→owner lookup (property appraiser) or the RealeFlow enrichment
  step we already run. `handler = 'pdf_list'`.

### 2. Sarasota County (fips 12115) — HTML page, promising
- Page: sarasotaclerk.com → "Surplus Funds from Tax Deed Sale"
- Also a public "Citizens with Unclaimed Moneys" list. `handler = 'html_table'`
  (needs a second pass to confirm the on-page table shape).

## Also checked (status)
- Brevard: tax-deeds page mentions surplus/overbid but exposes only an
  affidavit form, not a downloadable list on the landing page — needs a deeper
  crawl.
- Pinellas / Duval / Lee: 403 to automation (real browser still blocked at
  edge) — revisit with the residential proxy or a records request.
- Polk / Orange Comptroller / St Lucie / Volusia / Manatee: URLs 404/500/timeout
  — need correct current URLs.

## Expanded probe — more FL counties (2026-08-13, round 2)

Broad Playwright sweep of ~26 clerk sites. Confirmed surplus/unclaimed LIST
sources below (many big counties 403 automation or moved URLs — revisit later).

| County | fips | Source | Format | Status |
|---|---|---|---|---|
| **Marion** | 12083 | Tax Deeds Surplus Funds report | **PDF** (dated, 11pg) | ✅ verified, has data (owner-less: sale#, date, parcel, $) |
| **Sarasota** | 12115 | "Unclaimed Money List 2026" | **PDF** (303KB) | ✅ list PDF found; also HTML surplus landing |
| **Osceola** | 12097 | Outstanding Checks & Unclaimed Funds + Claim Form 2026 | PDF/DOCX | ✅ list published, refreshed (July 2026) |
| **Sumter** | 12119 | Tax Deed Sales Surplus (overbids) + Registry Surplus | HTML table + PDF | ⚠️ structure good, tax-deed table EMPTY right now ("no properties…"); Registry Surplus PDF dated Jul 2026 has data |
| **Hernando** | 12053 | tax-deeds page mentions surplus/overbid | (needs deeper crawl) | 🟡 keywords present, list link not surfaced |
| **Collier** | 12021 | finance/unclaimed-monies | (needs deeper crawl) | 🟡 unclaimed page exists |

Blocked/wrong-URL (revisit with proxy or corrected URL): Lake (403),
Pinellas/Duval/Lee (403), Leon/Alachua/Okaloosa (DNS/timeout), Seminole/Bay/
Santa Rosa/Charlotte/Citrus/Clay/Nassau/Putnam/Highlands/Indian River
(404/timeout — URLs need updating).

### Handler-type coverage proven
- `pdf_list`  → Marion (best), Sarasota, Osceola, Sumter Registry
- `html_table` → Sumter tax-deed overbids (empty now, but correct shape)

## Round 3 — retried BLOCKED counties through iProyal residential proxy

Used the existing iProyal US residential proxy (creds in
`DEPLOY-GUIDE-realauction-runner.md`, `geo.iproyal.com:12321`) via Playwright.

| County | Proxy result | Notes |
|---|---|---|
| **Duval** | ✅ opened (was 403 direct) | BUT "Excess Proceeds"/unclaimed is a **name-search box**, not a downloadable list. Mostly towing/registry funds, not tax-deed surplus. Not scrapable as a list. |
| Pinellas | ❌ still blocked | advanced bot-protection (Cloudflare/Incapsula-class) — survives residential proxy; needs JS challenge solving |
| Lee | ❌ 403 | same |
| Palm Beach | ❌ 403 | same |
| Polk | ❌ 403 | same |
| Lake | ❌ tunnel/403 | same |

**Conclusion:** the residential proxy DOES defeat plain datacenter-IP 403s
(Duval proved it), but the big counties use JS-challenge bot walls the proxy
alone can't pass, and several expose only a search box rather than a list.
The **published-PDF/HTML-list counties (Marion, Sarasota, Osceola, Sumter)
remain the fastest, most reliable path** — no proxy even required for those.
Save the proxy for a later pass with a challenge-solver if a big county's list
is ever worth it.

## Recommendation — start with these two counties

**Marion (pdf_list) + Sarasota (html_table)** prove BOTH handler types the
config table needs, which is the cheapest way to validate the whole
`surplus_sources` design before scaling. Marion is fully verified today; do it
first.

## Fields to store (maps onto distress_records + surplus extras)
doc_number (e.g. `SURP-<fips>-<sale_number>`), sale_date, parcel_apn,
amount (current balance / surplus), sale_type (tax_deed), county, state,
source_url, confidence ('clerk_confirmed' for these clerk lists).
Owner name enriched later (parcel → owner).

## Round 4 — re-probe of the "next" counties (post-Marion)

| County | Verdict |
|---|---|
| Sarasota (12115) | ❌ No tax-deed surplus LIST. Page carries only a claim form; the "Unclaimed Moneys" list is general clerk checks, not tax-deed surplus. Do not enable. |
| Osceola (12097) | ❌ "Outstanding Checks & Unclaimed Monies" = clerk checks, not tax-deed surplus. Do not enable. |
| Sumter (12119) | 🟡 Correct page (`/public-records/tax-deeds/tax-deed-overbids/`) with the right table shape, but it states "There are no properties on the tax deed surplus list at this time." Keep `unverified`; revisit when rows appear. |

**Marion remains the only FL county with a machine-readable clerk surplus list
we ingest end to end (645 rows, $6.87M).** Public guide pages for FL + Marion
are published and the public view now accepts clerk-primary rows.
