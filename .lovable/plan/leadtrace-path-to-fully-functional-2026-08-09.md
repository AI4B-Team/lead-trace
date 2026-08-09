# LeadTrace — Path to Fully Functional

Build order below. Stripe is intentionally last so everything else is testable without payments in the way.

## New capability: "Comp Accounts"

You (as system owner) can flag any workspace as **comped** — no monthly platform fee, only usage fees (SMS, skip trace, scrape credits) still apply.

- New `app_role` enum: `super_admin`, `owner`, `admin`, `member`
- New `user_roles` table (RLS-safe via `has_role()` security-definer function)
- New `workspaces.billing_plan` column: `trial` | `paid` | `comped` | `past_due`
- New `/app/admin` route visible only to `super_admin` — lists all workspaces, toggle "Comp this account" button
- Billing gate in the app: monthly fee enforced only when `billing_plan != 'comped'`; usage-fee metering still runs for everyone
- Your account seeded as `super_admin` on first migration

## Phase 1 — SMS operational core

1. **Number purchasing UI** at `/app/settings/numbers`
   - Search Telnyx inventory by area code → buy → assign to workspace
   - Uses existing `SmsProvider.buyNumber()`
2. **Inbox / conversations** at `/app/inbox`
   - Threaded view grouped by lead phone
   - Reply box (sends via existing provider)
   - Unread badge in sidebar
   - Filter: All / Unread / Opt-outs / Litigator flags
3. **10DLC brand + campaign submission** — wire the existing `registrations` form to Telnyx `/v2/10dlc/brand` and `/v2/10dlc/campaign` endpoints (currently just stores rows)
4. **TCPA quiet hours** — campaign runner respects recipient timezone (derived from area code); no sends outside 8am–9pm local

## Phase 2 — Data acquisition

5. **Scraper adapter — Apify** (`src/lib/scrapers/apify.ts`)
   - Implements existing `ScraperAdapter` interface
   - Covers Google Maps, Yelp, LinkedIn Sales Nav templates
   - Requires `APIFY_TOKEN` secret (I'll request it when Phase 2 starts)
6. **Skip trace provider — BatchSkipTracing** (`src/lib/skip-trace/batch.ts`)
   - Enriches leads with phone/email
   - Requires `BATCH_SKIP_TRACING_API_KEY`
7. **DNC + Litigator scrubber — Blacklist Alliance** (`src/lib/scrub/blacklist-alliance.ts`)
   - Runs automatically at end of every job
   - Populates `scrub_runs` with real results
   - Requires `BLACKLIST_ALLIANCE_API_KEY`

## Phase 3 — App UX gaps

8. **Lead detail drawer** — click any lead → full profile, skip trace fields, message history, notes
9. **CSV import** — upload → column-mapping wizard → job
10. **CSV export** — download any list, scrubbed or raw
11. **Campaign builder v2** — message composer with `{{first_name}}` variables, spintax (`{Hi|Hey|Yo}`), 3-step follow-up sequences, A/B variants
12. **Analytics** at `/app/analytics` — delivery rate, opt-out rate, response rate, per-campaign and per-number

## Phase 4 — Team & security

13. **Team invites** — email-based invites to a workspace, roles: `owner` / `admin` / `member`
14. **Password reset page** at `/reset-password` (currently missing)
15. **Roles enforcement** on server functions using `has_role()`
16. **Super-admin console** at `/app/admin` (comp accounts, view all workspaces, view usage per workspace)

## Phase 5 — Billing (Stripe, last)

17. Enable Lovable's built-in Stripe payments (seamless, no API key needed)
18. **Two-part billing model:**
    - **Platform fee** (monthly subscription) — waived for `comped` workspaces
    - **Usage fees** — SMS at cost + margin, skip trace per record, scrape credits — billed to *all* workspaces including comped ones
19. Wire `credit_ledger` + `credit_balances` to real Stripe usage records
20. "Top Up Credits" button in profile dropdown → Stripe Checkout
21. Usage webhook at `/api/public/hooks/stripe`

## Technical details

### Database changes
```sql
-- Roles
CREATE TYPE app_role AS ENUM ('super_admin', 'owner', 'admin', 'member');
CREATE TABLE user_roles (id uuid PK, user_id uuid FK auth.users, role app_role, workspace_id uuid nullable);
CREATE FUNCTION has_role(_user_id uuid, _role app_role) SECURITY DEFINER;

-- Billing plan
ALTER TABLE workspaces ADD COLUMN billing_plan text DEFAULT 'trial';

-- Conversations
ALTER TABLE messages ADD COLUMN thread_key text; -- lead phone for grouping
CREATE INDEX ON messages(workspace_id, thread_key, created_at);

-- CSV imports
CREATE TABLE lead_imports (id, workspace_id, source_filename, rows_total, rows_imported, status);
```

### External services (secrets I'll request per phase)
- Phase 2: `APIFY_TOKEN`, `BATCH_SKIP_TRACING_API_KEY`, `BLACKLIST_ALLIANCE_API_KEY`
- Phase 5: Stripe — no key needed (seamless integration)

### Files touched (rough)
- ~15 new routes under `src/routes/_authenticated/app.*`
- ~8 new server-function modules under `src/lib/*.functions.ts`
- ~10 migrations
- 3 new provider modules (`scrapers/`, `skip-trace/`, `scrub/`)

## Delivery cadence

I'll ship Phase 1 first as one push, then check in before Phase 2 (since it needs your API keys for the three vendors). Phases 3–4 can go in a single push after that. Phase 5 (Stripe) is the final push.

**Approve to start Phase 1** (comp-account roles infrastructure + number purchasing + inbox + 10DLC submission + quiet hours).