// API key minting and verification.
//
// The secret is shown exactly once at creation. We only ever store a SHA-256
// hash, so a database read can never reconstruct a working key.
const PREFIX = "lt_live_";

export async function hashApiKey(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns the full one-time secret plus the display prefix and stored hash. */
export async function mintApiKey(): Promise<{ secret: string; prefix: string; hash: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(24));
  const body = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const secret = `${PREFIX}${body}`;
  return { secret, prefix: secret.slice(0, PREFIX.length + 6), hash: await hashApiKey(secret) };
}

export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(PREFIX);
}
