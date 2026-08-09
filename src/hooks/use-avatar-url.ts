import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { signedAvatarUrl } from "@/lib/avatar";

/** Resolves the signed URL for the signed-in user's profile photo, if any. */
export function useAvatarUrl() {
  const { user } = useAuth();
  const path = (user?.user_metadata?.avatar_path as string | undefined) ?? null;
  const { data } = useQuery({
    queryKey: ["avatar-url", path],
    queryFn: () => (path ? signedAvatarUrl(path) : Promise.resolve(null)),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });
  return path ? (data ?? null) : null;
}
