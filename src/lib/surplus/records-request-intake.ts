/**
 * Column inference for clerk surplus lists that arrive by email (the
 * records-request path). A clerk who answers a public-records request sends
 * whatever headers their office uses, so there is no fetch_config to lean on
 * the way the scraped handlers do.
 *
 * The discipline is the same as everywhere else in the surplus pipeline: the
 * AMOUNT column must be identified with confidence or we parse nothing and
 * queue the file for a one-time human mapping. A wrong dollar figure reaching a
 * customer is far worse than a file that waits a day.
 */

const PATTERNS: Array<{ field: string; re: RegExp }> = [
  // Amount first: the most specific wording wins, and "opening bid" or
  // "amount owed" must never be read as the surplus itself.
  { field: "confirmed_amount", re: /^(surplus|surplus\s*(amount|funds|balance)|excess\s*(funds|proceeds|amount)?|unclaimed\s*(amount|funds|balance)|balance|amount\s*(held|available|of\s*surplus)|funds\s*held|held\s*amount)$/i },
  { field: "case_number", re: /^(case|case\s*(number|no\.?|#)|tax\s*deed\s*(number|no\.?|#)|file\s*(number|no\.?)|certificate\s*(number|no\.?)|sale\s*(number|no\.?))$/i },
  { field: "parcel_apn", re: /^(parcel|parcel\s*(id|number|no\.?|#)|apn|pin|property\s*id|folio|alternate\s*key|tax\s*id)$/i },
  { field: "property_address", re: /^(property\s*(address|location)|address|situs|situs\s*address|location)$/i },
  { field: "sale_date", re: /^(sale\s*date|date\s*of\s*sale|auction\s*date|sold\s*on|date\s*sold)$/i },
  { field: "claim_deadline", re: /^(claim\s*deadline|deadline|escheat\s*date|expires?(\s*on)?|last\s*day\s*to\s*claim)$/i },
  { field: "claim_status", re: /^(status|claim\s*status|disposition)$/i },
  { field: "claimant_name", re: /^(name|owner|owner\s*name|claimant|claimant\s*name|property\s*owner|defendant|payee|held\s*for)$/i },
];

const norm = (s: string) => s.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/** Header text → ClerkSurplusRow field, for the headers we recognise. */
export function inferSurplusColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const taken = new Set<string>();
  for (const header of headers) {
    const h = norm(String(header ?? ""));
    if (!h) continue;
    const hit = PATTERNS.find((p) => p.re.test(h));
    if (!hit || taken.has(hit.field)) continue;
    map[header] = hit.field;
    taken.add(hit.field);
  }
  return map;
}

/**
 * Usable means: we found the dollar figure AND at least one stable identifier
 * to dedupe on (case number, parcel, or address + sale date). Anything less and
 * a nightly re-send would create duplicate records instead of updating them.
 */
export function isUsableSurplusMap(map: Record<string, string>): boolean {
  const fields = new Set(Object.values(map));
  if (!fields.has("confirmed_amount")) return false;
  return (
    fields.has("case_number") ||
    fields.has("parcel_apn") ||
    (fields.has("property_address") && fields.has("sale_date"))
  );
}

/** Records (header → cell) from a header row plus data rows of text. */
export function matrixToRecords(matrix: string[][]): Array<Record<string, string>> {
  const headerIndex = matrix.findIndex((row) => {
    const map = inferSurplusColumnMap(row.filter(Boolean));
    return isUsableSurplusMap(map);
  });
  // Clerk workbooks often lead with an "as of" note, so fall back to the first
  // non-empty row rather than assuming row 1 is the header.
  const index = headerIndex >= 0 ? headerIndex : matrix.findIndex((row) => row.some((c) => c));
  if (index < 0) return [];
  const names = (matrix[index] ?? []).map((h) => String(h ?? "").trim());
  const out: Array<Record<string, string>> = [];
  for (const cells of matrix.slice(index + 1)) {
    if (!cells.some((c) => c)) continue;
    const rec: Record<string, string> = {};
    names.forEach((name, i) => {
      if (name) rec[name] = String(cells[i] ?? "").trim();
    });
    out.push(rec);
  }
  return out;
}