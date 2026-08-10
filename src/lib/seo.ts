// Canonical URLs must be absolute: relative hrefs let crawlers treat the
// preview host and the live domain as separate canonicals.
export const SITE_URL = "https://leadtrace.com";

/** Absolute canonical URL for a site-relative path ("/pricing" → "https://leadtrace.com/pricing"). */
export function canonicalUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return p === "/" ? `${SITE_URL}/` : `${SITE_URL}${p.replace(/\/+$/, "")}`;
}
