-- Per-user RealElite account provisioning (Tyler 2026-08-27 reply).
-- Feature ships DISABLED: the platform_flags row defaults to false and only a
-- super_admin can flip it (see realelite-accounts.functions.ts). Until then the
-- integration keeps running on the single env test account (192423), which
-- RealeFlow verbally approved for the testing period (8/25 chat).

-- 1) Generic platform feature flags (super-admin controlled, server-read).
CREATE TABLE IF NOT EXISTS public.platform_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  note        text,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_flags ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service-role key (server functions) can
-- read/write. Client code never touches this table directly.

INSERT INTO public.platform_flags (key, enabled, note)
VALUES (
  'realeflow_per_user_accounts',
  false,
  'When ON, new signups get their own RealElite account (SitePlan 589) and Property Data requests route per-user. OFF = single env test account.'
)
ON CONFLICT (key) DO NOTHING;

-- 2) Mapping: our user -> their RealElite account.
CREATE TABLE IF NOT EXISTS public.realeflow_accounts (
  user_id              uuid PRIMARY KEY,
  external_account_id  text NOT NULL,          -- what we sent (our user id)
  realeflow_account_id text NOT NULL,          -- AccountId returned by POST /api/account
  site_plan_id         integer NOT NULL DEFAULT 589,
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'deactivated', 'error')),
  error_detail         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS realeflow_accounts_external_idx
  ON public.realeflow_accounts (external_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS realeflow_accounts_account_idx
  ON public.realeflow_accounts (realeflow_account_id);

ALTER TABLE public.realeflow_accounts ENABLE ROW LEVEL SECURITY;
-- Service-role only, same reasoning as platform_flags: account ids are
-- billing-sensitive and must never be client-writable.
