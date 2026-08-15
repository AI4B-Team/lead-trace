# Georgia surplus (excess funds) custodian discovery — 2026-08-15

Counties: Clayton, Cobb (both on the `records_request` path after their surplus
pages were confirmed unscrapeable).

In Georgia, tax-sale **excess funds** are held by the Tax Commissioner, not the
Superior Court clerk, so both offices were targeted.

| Target | Result |
| --- | --- |
| claytoncountyga.gov (+ /government/tax-commissioner) | Proxy tunnel refused (`ERR_TUNNEL_CONNECTION_FAILED`); direct egress answers 307 loop. Sucuri challenge previously observed. |
| cobbtax.org (+ /property/excess-funds) | Proxy tunnel refused; direct egress 403. |
| cobbsuperiorcourtclerk.com | No connection from this network. |

Probed with the residential proxy both via plain fetch
(`scripts/discover-ga-clerk-contacts.ts`) and a headless Chromium session. The
provider will not tunnel to these hostnames, so **automated contact discovery
for GA is exhausted** — do not add more discovery rounds for these two.

Next action is human: enter the excess-funds custodian address in
Platform → Records → Surplus By Request. Requests then compose and send from
`records@leadtrace.com` on the nightly pass once the sender domain is verified.
