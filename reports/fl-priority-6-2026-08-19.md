# FL priority-6 surplus: the four gap counties (probed 2026-08-19)

Target metro: Tampa Bay / Central Florida. Hillsborough (`xlsx_list`, ~49 balances
/ ~$2.996M) and Osceola (`pdf_list`) were already live and were not touched.

Probe script: `scripts/discover-fl-priority6.ts` (reuses `discover-fl-clerk-links`
for discovery and `discover-fl-surplus-batch3.probe` for classification).
Raw output: `reports/fl-priority-6-2026-08-19.json`.

| County | Page reachable | Publishes a machine-readable list? | Outcome |
|---|---|---|---|
| Pasco | yes | **yes** — `Unclaimed Tax Deed Surplus 20260731.xlsx` | **LIVE**, `xlsx_list`, 73 / 73 / 73, $592,789.59 held |
| Pinellas | no (HTTP 403) | — | stays `records_request` |
| Polk | yes | no — claim paperwork only | stays `records_request` |
| Orange | yes | no — no held-funds list anywhere on the custodian's site | new `records_request` row |

## Pasco — promoted

The list is **not** on the "Annual Unclaimed Funds Publication" page the
2026-08-15 pass checked (that page carries no rows). It lives on the clerk's
separate public reports app:

- landing (stable): `http://app.pascoclerk.com/appdot-public-statistical-reports-taxdeeds.asp`
- document (rotates): `…/public_records/tax-deeds/Unclaimed%20Tax%20Deed%20Surplus%2020260731.xlsx`, updated 8/11/2026

so the source uses `indexUrl` + `linkPattern` rather than a pinned dated URL. The
`Unclaimed Tax Deed Surplus Affidavit.pdf` sitting next to it is a claim form and
is excluded by the pattern.

Header row 5, confirmed by hand against the live file:

```text
DATE RECEIVED | TDA # | ORIGINAL OWNER | PARCEL ID # | ACTUAL BALANCE | DATE PAID | AMOUNT PAID | BALANCE
```

Confirmed column map:

| Live header | Field | Why |
|---|---|---|
| `TDA #` | `case_number` | also `requirePresent`, which drops the title/blank rows |
| `PARCEL ID #` | `parcel_apn` | |
| `ORIGINAL OWNER` | `claimant_name` | the clerk prints the name the funds are held for |
| `ACTUAL BALANCE` | `confirmed_amount` | the only dollar column that is a held balance |
| `DATE PAID` | `skipWhenPresent` | money already disbursed has left the office |
| `DATE RECEIVED` | *(unmapped, kept in `raw`)* | receipt date, **not** the sale date — so `sale_date` stays null |
| `AMOUNT PAID`, `BALANCE` | *(unmapped)* | reconciliation columns, not the held figure |

No property address is published, so `property_address` stays null rather than
being assembled from the parcel.

One handler change was needed: the workbook appends a **new tab per month**
(`OCT 25` … `JUL 26`), each a fresh snapshot of what is still held. The first tab
is therefore the oldest, and pinning a month's name goes stale within a month, so
`xlsx_list` gained `sheetMode: "first" | "last"` and Pasco uses `"last"` to follow
the clerk's own append order.

Verified through the production `xlsx_list` path plus `clerkRowToFiling`:
**73 parsed / 73 with a positive amount / 73 unique `doc_number`s (0 dupes) /
$592,789.59 held**, every row `estimated: false`.

## Pinellas — stays on records_request

`mypinellasclerk.gov` answers **HTTP 403** to a plain robots-respecting GET on the
root and on every tax-deed / unclaimed path. `pinellas.realtaxdeed.com` disallows
automation site-wide in robots.txt. A managed challenge is never worked around, so
the county keeps the public-records-request path.

## Polk — stays on records_request

The clerk sitemap carries exactly one surplus-relevant page,
`polkclerkfl.gov/189/Tax-Deeds`. It links `Statement-of-Claim.pdf` and
`Request-For-Reinstatement-Tax-Deeds.pdf` — claim paperwork, not data — and no list
of held balances. `polk.realtaxdeed.com` is now **robots-disallowed**, so the
earlier "robots-allowed" note no longer holds and the RealTaxDeed side is not
collectable either.

## Orange — stays on records_request (new row)

Orange had no `surplus_funds` source row at all; it was live only as code
violations. The **Comptroller** (`occompt.com`), not the Clerk, is the tax-deed
custodian. Its whole sitemap carries five surplus-relevant pages and none is a
list of held tax-deed money:

- `/191 Tax-Deed-Sales`, `/194 Tax-Deed-Sales-FAQ` — sale process, no balances
- `/276 Unclaimed-Property` — claim instructions only
- `/160 Surplus-Equipment-and-Vehicles`, `/197 Records-Surplus-Property` — surplus
  **equipment and vehicles**, a different kind of surplus entirely

`orange.realtaxdeed.com` is robots-disallowed. Recorded as `records_request` so a
later sweep does not re-derive the same refusal. Note the Comptroller site also
began returning HTTP 429 during the sweep; the findings above come from the pages
that answered before it throttled, plus its sitemap.

## Net

**1 of 4** gap counties went live: Pasco, 73 rows, $592,789.59 held. Pinellas
(403), Polk (claim forms only) and Orange (no list published) stay on
`records_request`.

## Pinellas — residential-proxy attempt (2026-08-19)

Pinellas got its one legitimate attempt through the residential proxy path
(`WAF_CLERK_HOSTS` already covers `mypinellasclerk.gov` / `pinellasclerk.gov` /
`pinellasclerk.org`, so `requiresProxy()` is true and `politeFetch` routes there).

- Proxy verified working in this environment: `realauctionProxyStatus()` =
  available, egress IP resolved to a US residential Verizon Business line
  (Groton, MA) versus a datacenter IP on the direct control fetch.
- Every Pinellas Clerk URL still answered **HTTP 403 with an empty body** through
  the residential IP and a desktop Chrome UA: `/`, `/sitemap.xml`,
  `/Home/TaxDeeds`, and the `www.` variant. `pinellasclerk.org` returns an
  invalid TLS SAN; `www.pinellasclerk.org` answers 406 with an error page.
- `pinellas.realtaxdeed.com` is reachable (200) but its `robots.txt` is
  `User-agent: * / disallow: /`, so it is off-limits by policy.

**Outcome: Pinellas stays on `records_request`.** The block is an
unconditional 403 (not a solvable challenge), so there is nothing to read
without bypassing the WAF — which we do not do. No source row created.
