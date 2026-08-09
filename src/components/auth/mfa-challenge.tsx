import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { verifyMfaCode } from "@/lib/mfa";

/** Second step of sign-in for accounts with an authenticator registered. */
export function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await verifyMfaCode(code);
    setBusy(false);
    if (!result.ok) return toast.error(result.message);
    onVerified();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" /> Two-Factor Verification
      </div>
      <p className="text-sm text-muted-foreground">
        Enter The 6-Digit Code From Your Authenticator App To Finish Signing In.
      </p>
      <div>
        <Label htmlFor="mfa-signin-code">Authentication Code</Label>
        <Input
          id="mfa-signin-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-36 font-mono tracking-widest"
          placeholder="123456"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="rounded-full" disabled={busy}>
          {busy ? "Verifying..." : "Verify And Continue"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          disabled={busy}
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
        >
          Use A Different Account
        </Button>
      </div>
    </form>
  );
}
