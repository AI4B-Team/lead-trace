import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  Camera,
  KeyRound,
  MonitorSmartphone,
  History,
  Mail,
  KeyRound as KeyRoundIcon,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SettingsShell } from "@/components/app/settings-shell";
import { TwoFactorCard } from "@/components/app/two-factor-card";
import { removeAvatar, uploadAvatar } from "@/lib/avatar";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import {
  NotificationPrefs,
  normalizePrefs,
  type NotifyPrefs,
} from "@/components/app/notification-prefs";

const searchSchema = z.object({ tab: z.enum(["profile", "security", "notifications"]).optional() });

export const Route = createFileRoute("/_authenticated/app/account")({
  head: () => ({ meta: [{ title: "Settings — LeadTrace" }] }),
  validateSearch: searchSchema,
  component: AccountPage,
});

function AccountPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const avatarUrl = useAvatarUrl();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => normalizePrefs(undefined));
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName((user.user_metadata?.full_name as string) ?? "");
    setPhone((user.user_metadata?.phone as string) ?? "");
    setPrefs(normalizePrefs(user.user_metadata?.notify));
  }, [user]);

  const saveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, phone },
    });
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Profile Saved");
  };

  const handlePhotoPick = async (file: File | undefined) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await uploadAvatar(file);
      await queryClient.invalidateQueries({ queryKey: ["avatar-url"] });
      toast.success("Profile Photo Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload Failed");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handlePhotoRemove = async () => {
    setUploadingPhoto(true);
    try {
      await removeAvatar();
      await queryClient.invalidateQueries({ queryKey: ["avatar-url"] });
      toast.success("Profile Photo Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could Not Remove Photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    const { error } = await supabase.auth.updateUser({ data: { notify: prefs } });
    setSavingPrefs(false);
    if (error) return toast.error(error.message);
    toast.success("Notification Settings Saved");
  };

  const savePassword = async () => {
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) return toast.error(error.message);
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated");
  };

  const sendReset = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Reset email sent");
  };

  const displayName = fullName || user?.email?.split("@")[0] || "You";
  const passwordChangedAt = (user?.updated_at ?? user?.created_at) as string | undefined;
  const passwordUpdatedLabel = passwordChangedAt
    ? (() => {
        const days = Math.floor((Date.now() - new Date(passwordChangedAt).getTime()) / 86400000);
        return days <= 0 ? "Today" : `${days} Day${days === 1 ? "" : "s"} Ago`;
      })()
    : "Unknown";
  // First + last name initials, matching the header avatar.
  const initials = (() => {
    const parts = displayName.split(/[\s.@_-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
    }
    return (parts[0] ?? displayName).slice(0, 2).toUpperCase();
  })();

  return (
    <div className="mx-auto max-w-[1400px]">
      <SettingsShell current={tab ?? "profile"}>
      <PageHeader
        title="Settings"
        description="Manage Your Profile, Workspace, Billing, Compliance, And Team."
      />
      <Tabs
        value={tab ?? "profile"}
        onValueChange={(v) =>
          navigate({ search: { tab: v as "profile" | "security" | "notifications" }, replace: true })
        }
      >
        <TabsContent value="profile" className="mt-0">
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base font-display">Profile</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-lg font-display font-bold text-primary-foreground">
                      {initials || "LT"}
                    </div>
                    <div>
                      <div className="font-display font-bold text-foreground">{displayName}</div>
                      <div className="text-xs text-muted-foreground">Owner</div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 rounded-full"
                        onClick={() => toast.info("Photo Upload Is Coming Soon.")}
                      >
                        <Camera className="mr-1.5 h-3.5 w-3.5" /> Change Photo
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="full-name">Full Name</Label>
                      <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" placeholder="+1 555 555 5555" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" value={user?.email ?? ""} disabled className="mt-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button className="rounded-full" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <div className="space-y-6">
              <IdentityCard
                initials={initials || "LT"}
                name={displayName}
                email={user?.email ?? ""}
                verified={!!user?.email_confirmed_at}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-0">
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Notifications</h2>
                <p className="text-sm text-muted-foreground">
                  Choose What We Send You And Where. In-App Badges Stay On No Matter What.
                </p>
              </div>
              <NotificationPrefs prefs={prefs} onChange={setPrefs} />
              <Button className="rounded-full" onClick={savePrefs} disabled={savingPrefs}>
                {savingPrefs ? "Saving..." : "Save Notifications"}
              </Button>
            </div>
            <div className="space-y-6">
              <IdentityCard
                initials={initials || "LT"}
                name={displayName}
                email={user?.email ?? ""}
                verified={!!user?.email_confirmed_at}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-0">
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-display">
                    <KeyRound className="h-4 w-4 text-muted-foreground" /> Password
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="new-pass">New Password</Label>
                      <Input id="new-pass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="confirm-pass">Confirm Password</Label>
                      <Input id="confirm-pass" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="rounded-full" onClick={savePassword} disabled={savingPassword}>
                      {savingPassword ? "Updating..." : "Update Password"}
                    </Button>
                    <Button variant="outline" className="rounded-full" onClick={sendReset}>
                      Send Reset Email
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last Updated {passwordUpdatedLabel} · Use At Least 12 Characters With A Number And Symbol.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-display">
                    <Mail className="h-4 w-4 text-muted-foreground" /> Recovery Email
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{user?.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {user?.email_confirmed_at ? "Verified — Used For Password Resets" : "Not Verified Yet"}
                    </div>
                  </div>
                  <Button variant="outline" className="rounded-full" onClick={sendReset}>
                    Verify
                  </Button>
                </CardContent>
              </Card>

              <TwoFactorCard />

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-display">
                    <MonitorSmartphone className="h-4 w-4 text-muted-foreground" /> Active Sessions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        This Device <Badge variant="secondary">Current</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {typeof navigator !== "undefined" ? navigator.platform || "Browser" : "Browser"} ·
                        {" "}Signed In {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Recently"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={async () => {
                        await supabase.auth.signOut();
                        window.location.href = "/auth";
                      }}
                    >
                      Sign Out
                    </Button>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Last Sign-In{" "}
                    {user?.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString()
                      : "Unavailable"}{" "}
                    · Account Created{" "}
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-display">
                    <KeyRoundIcon className="h-4 w-4 text-muted-foreground" /> API Keys
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <p className="max-w-xl text-sm text-muted-foreground">
                    Workspace API Keys Are Managed On The API Page.
                  </p>
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link to="/app/api">Open API</Link>
                  </Button>
                </CardContent>
              </Card>

            </div>

            <div className="space-y-6">
              <IdentityCard
                initials={initials || "LT"}
                name={displayName}
                email={user?.email ?? ""}
                verified={!!user?.email_confirmed_at}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </SettingsShell>
    </div>
  );
}

function IdentityCard({
  initials,
  name,
  email,
  verified,
}: {
  initials: string;
  name: string;
  email: string;
  verified: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-display font-bold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display font-bold text-foreground">{name}</div>
            <div className="truncate text-xs text-muted-foreground">{email}</div>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium text-foreground">Owner</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className={verified ? "font-medium text-success" : "font-medium text-warn"}>
              {verified ? "Verified" : "Unverified"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Two-Factor</span>
            <span className="font-medium text-warn">Disabled</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
