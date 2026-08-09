/**
 * Real TOTP two-factor enrollment. Supabase issues the secret + QR, the user
 * confirms with one code, and the verified factor can be removed later.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone, ShieldCheck, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type Factor = { id: string; status: string; friendly_name?: string | null };

export function TwoFactorCard() {
  const [loading, setLoading] = useState(true);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (error) return;
    const all = [...(data?.totp ?? []), ...(data?.all ?? [])] as Factor[];
    setFactor(all.find((f) => f.status === "verified") ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setBusy(true);
    // Clear abandoned, unverified enrollments so re-entry never dead-ends.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of ((existing?.all ?? []) as Factor[]).filter((f) => f.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Could Not Start Setup");
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async () => {
    if (!enroll) return;
    if (code.replace(/\D/g, "").length !== 6) return toast.error("Enter The 6-Digit Code");
    setBusy(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
    if (challenge.error || !challenge.data) {
      setBusy(false);
      return toast.error(challenge.error?.message ?? "Could Not Verify");
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enroll.id,
      challengeId: challenge.data.id,
      code: code.replace(/\D/g, ""),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEnroll(null);
    setCode("");
    toast.success("Two-Factor Authentication Enabled");
    void refresh();
  };

  const disable = async () => {
    if (!factor) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Two-Factor Authentication Removed");
    void refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-display">
          <Smartphone className="h-4 w-4 text-muted-foreground" /> Two-Factor Authentication
          {factor ? (
            <Badge variant="secondary" className="ml-1">
              <ShieldCheck className="mr-1 h-3 w-3" /> On
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {factor
              ? "A One-Time Code From Your Authenticator App Is Required On New Sign-Ins."
              : "Require A One-Time Code From Your Phone On Every New Sign-In."}
          </p>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : factor ? (
            <Button variant="outline" className="rounded-full" onClick={disable} disabled={busy}>
              Remove
            </Button>
          ) : enroll ? null : (
            <Button variant="outline" className="rounded-full" onClick={startEnroll} disabled={busy}>
              {busy ? "Starting..." : "Enable"}
            </Button>
          )}
        </div>

        {enroll ? (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <img
                src={enroll.qr}
                alt="Two-factor setup QR code"
                className="h-40 w-40 shrink-0 rounded-lg bg-white p-2"
              />
              <div className="min-w-0 space-y-2">
                <p className="text-sm text-foreground">
                  Scan This With Google Authenticator, 1Password, Or Authy.
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  Can't Scan? Enter This Key Manually: <span className="font-mono">{enroll.secret}</span>
                </p>
                <div>
                  <Label htmlFor="mfa-code">6-Digit Code</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="mt-1 w-32 font-mono tracking-widest"
                    placeholder="123456"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button className="rounded-full" onClick={confirm} disabled={busy}>
                    {busy ? "Verifying..." : "Confirm"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-full"
                    onClick={async () => {
                      await supabase.auth.mfa.unenroll({ factorId: enroll.id });
                      setEnroll(null);
                      setCode("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
