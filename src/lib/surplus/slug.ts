import { US_STATES } from "@/lib/us-geo";

/**
 * The dedicated surplus hub accepts both `/surplus-funds/florida` and
 * `/surplus-funds/fl`; the guide pages themselves are keyed by two-letter code,
 * so everything funnels through this one resolver.
 */
export function stateCodeFromSlug(slug: string): string | null {
  const raw = slug.trim().toLowerCase();
  if (!raw) return null;
  if (raw.length === 2) {
    const code = raw.toUpperCase();
    return US_STATES.some((s) => s.code === code) ? code : null;
  }
  const name = raw.replace(/-/g, " ");
  return US_STATES.find((s) => s.name.toLowerCase() === name)?.code ?? null;
}

export function stateSlug(code: string): string {
  return code.toLowerCase();
}