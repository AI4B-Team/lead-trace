import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lookupInvite, acceptInvite } from "@/lib/team.functions";
import { BRAND_NAME } from "@/config/brand";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/accept-invite")({
  head: () => ({
    meta: [
      { title: `Accept Invite — ${BRAND_NAME}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const doLookup = useServerFn(lookupInvite);
  const doAccept = useServerFn(acceptInvite);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["invite-lookup", token],
    queryFn: () => doLookup({ data: { token: token! } }),
    enabled: !!token,
  });

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      await doAccept({ data: { token } });
      toast.success("Joined workspace");
      navigate({ to: "/app/dashboard" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Join {BRAND_NAME}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token && <p className="text-sm text-muted-foreground">Missing invite token.</p>}
          {token && isLoading && <p className="text-sm text-muted-foreground">Checking invite…</p>}
          {data && !data.valid && (
            <p className="text-sm text-destructive">
              This invite is {data.reason === "used" ? "already used" : data.reason === "expired" ? "expired" : "invalid"}.
            </p>
          )}
          {data && data.valid && (
            <>
              <p className="text-sm">
                You've been invited to join <span className="font-semibold">{data.invite.workspaceName}</span> as{" "}
                <span className="capitalize font-semibold">{data.invite.role}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                Invite email: <span className="font-mono">{data.invite.email}</span>
              </p>
              {signedIn === false ? (
                <Button asChild className="w-full rounded-full">
                  <Link to="/auth" search={{ mode: "signup", redirect: `/accept-invite?token=${token}` } as any}>
                    Sign in to accept
                  </Link>
                </Button>
              ) : (
                <Button className="w-full rounded-full" onClick={accept} disabled={accepting || signedIn === null}>
                  {accepting ? "Joining..." : "Accept Invite"}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}