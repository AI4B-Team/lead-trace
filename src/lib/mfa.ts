import { supabase } from "@/integrations/supabase/client";

/**
 * A verified TOTP factor only protects the account if the session is actually
 * stepped up. Supabase signs the user in at aal1 and reports aal2 as the next
 * level, so every entry point has to challenge before letting the app render.
 */
export async function mfaStepUpRequired(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

/** Verifies a 6-digit code against the user's verified TOTP factor. */
export async function verifyMfaCode(code: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return { ok: false, message: "Enter The 6-Digit Code" };
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, message: listError.message };
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) return { ok: false, message: "No Authenticator Is Registered" };
  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error || !challenge.data) {
    return { ok: false, message: challenge.error?.message ?? "Could Not Start Verification" };
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code: digits,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
