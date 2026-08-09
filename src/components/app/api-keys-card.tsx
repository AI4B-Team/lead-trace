import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, KeyRound, Loader2, RefreshCw, Ban } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { useTeamContext } from "@/hooks/use-team-context";
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey } from "@/lib/api-keys.functions";

const SCOPE_OPTIONS = [
  { value: "read" as const, label: "Read", note: "Leads, lists, campaigns" },
  { value: "write" as const, label: "Write", note: "Trigger list runs" },
];

/**
 * Scoped, revocable API keys. The secret is rendered exactly once — we store
 * only a hash, so there is no way to show it again later.
 */
export function ApiKeysCard() {
  const { workspaceId } = useWorkspaceId();
  const { isAdmin } = useTeamContext();
  const fetchKeys = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const rotate = useServerFn(rotateApiKey);
  const revoke = useServerFn(revokeApiKey);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Array<"read" | "write">>(["read"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ["api-keys", workspaceId],
    queryFn: () => fetchKeys({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
  const keys = data?.keys ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong.");

  const mCreate = useMutation({
    mutationFn: () => create({ data: { workspaceId: workspaceId!, name, scopes } }),
    onSuccess: (res) => {
      setSecret(res.secret);
      setName("");
      setScopes(["read"]);
      toast.success("Key created. Copy it now — it is shown once.");
      refresh();
    },
    onError: fail,
  });

  const mRotate = useMutation({
    mutationFn: (id: string) => rotate({ data: { id } }),
    onSuccess: (res) => {
      setSecret(res.secret);
      toast.success("Key rotated. The previous secret no longer works.");
      refresh();
    },
    onError: fail,
  });

  const mRevoke = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Key revoked.");
      refresh();
    },
    onError: fail,
  });

  const copy = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base font-display">
          <KeyRound className="h-4 w-4 text-primary" /> API Keys
        </CardTitle>
        <Badge variant="outline" className="text-muted-foreground">
          {keys.filter((k) => !k.revoked_at).length} Active
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-xl text-sm text-muted-foreground">
          Scoped, revocable keys for reading leads and triggering runs. Keys are shown once at
          creation, can be rotated without downtime, and revoked instantly.
        </p>

        {secret && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
            <div className="text-xs font-medium text-foreground">Your New Key — Copy It Now</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
                {secret}
              </code>
              <Button size="sm" variant="outline" className="rounded-full" onClick={copy}>
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>Done</Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              We store only a hash of this key. If it is lost, rotate to issue a new one.
            </p>
          </div>
        )}

        {keys.length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border">
            {keys.map((k) => {
              const revoked = !!k.revoked_at;
              return (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{k.name}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {k.prefix}…
                      </code>
                      {revoked ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Revoked</Badge>
                      ) : (
                        (k.scopes ?? []).map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] font-normal">{s}</Badge>
                        ))
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Created {new Date(k.created_at).toLocaleDateString()} ·{" "}
                      {k.last_used_at
                        ? `Last used ${new Date(k.last_used_at).toLocaleString()}`
                        : "Never used"}
                    </div>
                  </div>
                  {!revoked && isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={mRotate.isPending}
                        onClick={() => mRotate.mutate(k.id)}
                      >
                        <RefreshCw className="mr-1 h-3.5 w-3.5" /> Rotate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-danger"
                        disabled={mRevoke.isPending}
                        onClick={() => mRevoke.mutate(k.id)}
                      >
                        <Ban className="mr-1 h-3.5 w-3.5" /> Revoke
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isAdmin ? (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div>
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Zapier Production"
              />
            </div>
            <div>
              <Label>Scopes</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SCOPE_OPTIONS.map((s) => {
                  const on = scopes.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setScopes((prev) =>
                          on ? prev.filter((x) => x !== s.value) : [...prev, s.value],
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        on
                          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border-border bg-muted text-foreground hover:border-primary/40 hover:bg-muted/70"
                      }`}
                    >
                      {s.label} — {s.note}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              size="sm"
              className="rounded-full"
              disabled={!name.trim() || !scopes.length || !workspaceId || mCreate.isPending}
              onClick={() => mCreate.mutate()}
            >
              {mCreate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create Key
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Only admins can create or revoke API keys.</p>
        )}
      </CardContent>
    </Card>
  );
}
