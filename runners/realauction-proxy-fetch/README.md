# RealAuction proxy runner

A single-purpose Deno service that performs one RealAuction page fetch through
the residential proxy and returns the raw HTML. Parsing, dedupe, ingest and
reporting all stay in the app.

## Why

RealAuction (`*.realforeclose.com`, `*.realtaxdeed.com`) blocks datacenter IPs
with HTTP 403. The app runs on Cloudflare Workers, where `fetch()` has no proxy
option and raw sockets cannot set the TLS server name, so the proxied hop has to
happen in Deno (`Deno.createHttpClient({ proxy })`).

## Deploy

```
deno run --allow-net --allow-env --unstable-http main.ts
```

Runner environment:

| Variable       | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `PROXY_URL`    | Residential proxy URL. Stays on the runner; never logged.      |
| `RELAY_SECRET` | Shared secret the app sends as `x-internal-secret`.            |

App secrets (so the pipeline uses the runner):

| Variable                    | Value                            |
| --------------------------- | -------------------------------- |
| `REALAUCTION_RELAY_URL`     | The runner's public URL          |
| `REALAUCTION_RELAY_SECRET`  | Same value as `RELAY_SECRET`     |

With neither set, the pipeline falls back to the hosted website-fetch gateway
(`AGW_URL` + `AGW_TOKEN`/`LOVABLE_API_KEY`), and with nothing configured it
skips RealAuction counties instead of issuing direct fetches that would 403.

## Contract

`POST /` with `x-internal-secret: <RELAY_SECRET>`

```json
{ "url": "https://duval.realtaxdeed.com/index.cfm?zaction=USER", "accept": "text/html" }
```

Response: `{ "status": 200, "bytes": 48213, "contentType": "text/html", "body": "<html>…" }`

Rules enforced by the runner: vendor domains only, desktop Chrome User-Agent,
≥5s per-host delay, single concurrency, no retries, 4 MB per-response ceiling.
The app keeps the auction-window blackout and the ~10 MB nightly cap.