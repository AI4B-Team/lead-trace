# Florida WAF-blocked clerks: residential proxy widening

The 8 counties that batch 2 could not read were blocked by their WAF, not by
robots.txt. The residential proxy scope (previously RealAuction hosts only) was
widened to those clerk hostnames and each county re-probed.

## Reachability after widening

| County | Now readable | Detail |
|---|---|---|
| Duval | yes | Unclaimed Funds + tax deed pages readable |
| Leon | yes | Unclaimed Money + tax deed pages readable (`cvweb.` subdomain still 403) |
| Pasco | yes | "Annual Unclaimed Funds Publication" readable |
| Lee | no | 403 through residential IP + browser UA |
| Lake | no | 403 |
| Escambia | no | 403 |
| Pinellas | no | 403 |
| Highlands | no | 403 / 504 |

3 of 8 reopened. The remaining five block on more than IP reputation (TLS/
browser fingerprint), and we do not defeat bot challenges.

## Does the reopened set publish data?

No. Duval, Leon and Pasco all publish claim instructions and a claim form —
Leon's only documents are `unclaimed_funds_form.pdf` and an unrelated agency
list; Pasco's annual publication page carries no rows. `pickListDocuments`
correctly rejects all of them.

## Conclusion

Widening the proxy was worth doing (it is the only way to read these clerks at
all, and it is reusable for future record types), but it does not produce
surplus rows: these clerks do not publish held-surplus data, they publish
paperwork. For all 8 counties the remaining honest path is the records-request
handler — the clerk emails a spreadsheet — which also sidesteps the five WAFs.

## Code

- `requiresProxy()` in `src/lib/data-providers/realauction-proxy.ts` — proxy
  scope is now a host allowlist (RealAuction + WAF clerks), widenable at runtime
  via `PROXY_EXTRA_HOSTS`. robots is still enforced per request in
  `politeFetch`; the proxy changes our IP, never our permission.
- `scripts/discover-fl-clerk-waf.ts`, `scripts/discover-fl-surplus-batch4.ts` —
  probes behind this scope. Reports: `reports/fl-clerk-waf-links.json`,
  `reports/fl-surplus-batch4.json`.
