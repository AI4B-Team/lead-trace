import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { signedAvatarUrl } from "@/lib/avatar";

/** Resolves the signed URL for the signed-in user's profile photo, if any.
 *  Reads the stored path from Supabase Auth directly, because the cached
 *  session snapshot can lag behind a freshly uploaded photo. */
export function useAvatarUrl() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["avatar-url", user?.id ?? "anon", user?.user_metadata?.avatar_path ?? null],
    enabled: !!user,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data: fresh } = await supabase.auth.getUser();
      const path =
        (fresh.user?.user_metadata?.avatar_path as string | undefined) ??
        (user?.user_metadata?.avatar_path as string | undefined);
      if (!path) return null;
      return signedAvatarUrl(path);
    },
  });
  return data ?? null;
}
