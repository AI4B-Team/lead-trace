import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/** Uploads a profile photo into the signed-in user's own folder and records the
 *  object path on their account metadata. Returns the stored path. */
export async function uploadAvatar(file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Use A PNG, JPG, Or WebP Image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image Must Be Under 2 MB.");
  }
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;
  if (!userId) throw new Error("You Must Be Signed In.");

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  const previous = sessionData.user?.user_metadata?.avatar_path as string | undefined;
  const { error } = await supabase.auth.updateUser({ data: { avatar_path: path } });
  if (error) throw new Error(error.message);
  if (previous && previous !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  }
  return path;
}

/** Removes the stored photo and clears it from account metadata. */
export async function removeAvatar(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const previous = data.user?.user_metadata?.avatar_path as string | undefined;
  const { error } = await supabase.auth.updateUser({ data: { avatar_path: null } });
  if (error) throw new Error(error.message);
  if (previous) await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
}

/** Signed read URL for a private avatar object (valid for one hour). */
export async function signedAvatarUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}
