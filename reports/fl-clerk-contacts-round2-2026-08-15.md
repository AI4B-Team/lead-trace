# Records-Request Custodian Contacts — Round 2 (proxied)
Date: 2026-08-15

Probed the 21 request-path counties (19 FL + Clayton/Cobb GA) through residential
egress, reading only pages the clerk publishes and extracting only addresses they
print themselves.

## Confirmed and seeded
- **Hernando FL** — `publicrecordsrequest@hernandoclerk.org` (clerk public-records page).
  Seeded as the surplus custodian contact.

## Found but rejected
- **Brevard FL** — only `helpdesk@brevardclerk.us` (IT helpdesk, not the records
  custodian). Not seeded: a request to a helpdesk goes nowhere.

## Still blocked
- 403 to residential egress as well: Citrus, Escambia, Highlands, Lake, Lee,
  Pinellas, Polk, Sarasota, St. Lucie, Clayton (GA).
- Contact/records paths 404 (site uses non-conventional paths): Bay, Charlotte,
  Leon, Nassau, Okaloosa, Pasco.
- No published address on reachable pages: Duval, Volusia.
- Cobb GA: gateway timeouts (504).

## Next
These counties need their custodian address entered by hand in
Platform → Records → Surplus By Request (phone or clerk directory lookup). The
queue already accepts a per-county email and triggers a send.
