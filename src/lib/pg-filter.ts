/**
 * PostgREST `or()` filters are a comma-separated, parenthesis-delimited mini
 * language, so interpolating raw user text into one breaks the whole query:
 * searching for `Smith, John` or `Acme (FL)` produced a 400 from the API rather
 * than zero results. Wrapping the value in double quotes makes commas and
 * parentheses literal; embedded quotes and backslashes still need escaping.
 */
export function pgFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Quoted `%value%` pattern for use with `ilike` inside an `or()` filter. */
export function pgIlikePattern(value: string): string {
  return pgFilterValue(`%${value}%`);
}
