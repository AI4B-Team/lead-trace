// RealElite per-user account provisioning (Tyler's 2026-08-27 spec).
// Server-only: uses the Partner API key. Never import from client components.
//
// Flow (when the 'realeflow_per_user_accounts' platform flag is ON):
//   user signs up -> ensureRealeflowAccount(userId, email, name)
//     -> POST {BASE}/api/account?key={KEY}  { FirstName, LastName, Email,
//        PlanId: 589, ExternalAccountId: <our user id> }
//     -> store returned AccountId in realeflow_accounts
//   every Property Data call for that user then passes their AccountId via
//   RfRequestOptions.accountId (client.server.ts already supports this).
//
// While the flag is OFF (default) nothing here is called by signup, and
// accountIdForUser() returns null so all requests fall back to the env
// test account — exactly the approved testing-period behavior.

import process from "node:process";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FLAG_KEY = "realeflow_per_user_accounts";

/** Default plan per Tyler: 589 is the only plan with the Premium lead types. */
const DEFAULT_PLAN_ID = 589;

export class RealeflowAccountError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RealeflowAccountError";
  }
}

// ── Feature flag ────────────────────────────────────────────────────────────

export async function perUserAccountsEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("platform_flags")
    .select("enabled")
    .eq("key", FLAG_KEY)
    .maybeSingle();
  return data?.enabled === true;
}

export async function setPerUserAccountsEnabled(
  enabled: boolean,
  actorUserId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("platform_flags")
    .upsert(
      {
        key: FLAG_KEY,
        enabled,
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) throw new RealeflowAccountError(500, error.message);
}

// ── Account Management API ──────────────────────────────────────────────────

function accountApiConfig() {
  const baseUrl = process.env.REALEFLOW_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.REALEFLOW_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new RealeflowAccountError(
      500,
      "Realeflow API is not configured. Set REALEFLOW_BASE_URL and REALEFLOW_API_KEY.",
    );
  }
  return { baseUrl, apiKey };
}

const BROWSER_HEADERS = {
  Accept: "application/json",
  // Cloudflare on app.realelite.com serves an interstitial to non-browser UAs.
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

type CreateAccountResponse = {
  AccountId?: number | string;
  accountId?: number | string;
  Id?: number | string;
  [k: string]: unknown;
};

/**
 * Create one end-user RealElite account (Tyler section a).
 * NOTE: the Account Management API authenticates with the key as a QUERY
 * PARAM (`key=`), not the X-RF-Partner-Api-Key header used by leadpipes.
 */
async function createRealeliteAccount(input: {
  firstName: string;
  lastName: string;
  email: string;
  externalAccountId: string;
  planId?: number;
}): Promise<string> {
  const { baseUrl, apiKey } = accountApiConfig();
  const url = `${baseUrl}/api/account?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      FirstName: input.firstName,
      LastName: input.lastName,
      Email: input.email,
      PlanId: input.planId ?? DEFAULT_PLAN_ID,
      ExternalAccountId: input.externalAccountId,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new RealeflowAccountError(res.status, `Account create failed: ${text.slice(0, 300)}`);
  }
  const parsed = JSON.parse(text) as CreateAccountResponse;
  const accountId = parsed.AccountId ?? parsed.accountId ?? parsed.Id;
  if (accountId === undefined || accountId === null || `${accountId}`.length === 0) {
    throw new RealeflowAccountError(502, `Account create returned no AccountId: ${text.slice(0, 300)}`);
  }
  return String(accountId);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Idempotently ensure a user has a RealElite account. Returns the mapping row.
 * No-op (returns null) while the platform flag is OFF.
 */
export async function ensureRealeflowAccount(user: {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ realeflowAccountId: string } | null> {
  if (!(await perUserAccountsEnabled())) return null;

  // Existing mapping wins (idempotency — safe to call on every login/signup).
  const { data: existing } = await supabaseAdmin
    .from("realeflow_accounts")
    .select("realeflow_account_id, status")
    .eq("user_id", user.userId)
    .maybeSingle();
  if (existing?.status === "active") {
    return { realeflowAccountId: existing.realeflow_account_id };
  }

  try {
    const accountId = await createRealeliteAccount({
      firstName: user.firstName?.trim() || "LeadTrace",
      lastName: user.lastName?.trim() || "User",
      email: user.email,
      externalAccountId: user.userId,
    });
    const { error } = await supabaseAdmin.from("realeflow_accounts").upsert(
      {
        user_id: user.userId,
        external_account_id: user.userId,
        realeflow_account_id: accountId,
        site_plan_id: DEFAULT_PLAN_ID,
        status: "active",
        error_detail: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new RealeflowAccountError(500, error.message);
    return { realeflowAccountId: accountId };
  } catch (err) {
    // Record the failure but never block signup on a vendor hiccup.
    const detail = err instanceof Error ? err.message : String(err);
    await supabaseAdmin.from("realeflow_accounts").upsert(
      {
        user_id: user.userId,
        external_account_id: user.userId,
        realeflow_account_id: "",
        status: "error",
        error_detail: detail.slice(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    return null;
  }
}

/**
 * The RealElite account id Property Data calls should run under for a user.
 * Returns null when the flag is OFF or the user has no active mapping —
 * callers then fall back to the env test account (current behavior).
 */
export async function accountIdForUser(userId: string): Promise<string | null> {
  if (!(await perUserAccountsEnabled())) return null;
  const { data } = await supabaseAdmin
    .from("realeflow_accounts")
    .select("realeflow_account_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.status !== "active" || !data.realeflow_account_id) return null;
  return data.realeflow_account_id;
}
