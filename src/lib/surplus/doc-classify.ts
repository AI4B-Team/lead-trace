// ---------------------------------------------------------------------------
// Telling a published *list* of held surplus apart from a *claim form*.
//
// Clerks host both under wording that contains "surplus" or "unclaimed":
//   list:  Unclaimed-Funds-List-July-2026.pdf
//   form:  Claim-to-Surplus-Proceeds_ada.pdf, Unclaimed-Monies-Affidavit.pdf
// Treating a form as a list produces a source that ingests zero rows at best,
// and at worst maps a form's specimen figures into customer-facing amounts.
// ---------------------------------------------------------------------------

/** Filename wording that means "paperwork the claimant fills in", not data. */
const FORM_WORDS =
  /(affidavit|claim(ant)?[-_\s]*(to|for|of|form|packet|instructions)|[-_\s]form(s)?[-_\s.]|application|notice|instructions|checklist|w-?9|fillable|petition|sample|template|faq|brochure)/i;

/** Filename wording that means "here are the records". */
const LIST_WORDS =
  /(list|report|register|ledger|roll|balances|held|outstanding|available[-_\s]*funds|surplus[-_\s]*(funds|proceeds)?[-_\s]*(list|report)|\d{4})/i;

export function isLikelyClaimForm(url: string): boolean {
  const name = fileName(url);
  return FORM_WORDS.test(name) && !/\b(list|report|register)\b/i.test(name);
}

export function isLikelySurplusList(url: string): boolean {
  const name = fileName(url);
  if (isLikelyClaimForm(name)) return false;
  if (!/(surplus|overbid|excess|unclaimed|tax.?deed)/i.test(name)) return false;
  return LIST_WORDS.test(name);
}

/** Keeps only documents that plausibly contain rows, best candidate first. */
export function pickListDocuments(urls: string[]): string[] {
  const scored = urls
    .filter((u) => isLikelySurplusList(u))
    .map((u) => ({ u, score: (/\.(xlsx?|csv)$/i.test(u) ? 2 : 0) + (/(surplus|overbid|excess)/i.test(u) ? 1 : 0) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.u);
}

function fileName(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  return decodeURIComponent(withoutQuery.split("/").pop() ?? withoutQuery);
}
