// ---------------------------------------------------------------------------
// Heuristic category detection for the free-form "Train Your Agent" composer.
// The composer used to hard-stamp everything as "scripts", which broke the
// readiness score (it counts category BREADTH). These rules are deliberately
// simple and explainable — no AI call, just structural cues in the pasted text.
// Order matters: the most distinctive shapes are checked first.
// ---------------------------------------------------------------------------

export type ClassifiedKnowledge = {
  category: "faqs" | "calls" | "emails" | "catalog" | "scripts" | "videos" | "documents";
  /** Human title shown in Recent Training, e.g. "Pasted FAQs". */
  title: string;
};

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export function classifyKnowledge(raw: string): ClassifiedKnowledge {
  const text = raw.trim();
  const lower = text.toLowerCase();

  // FAQ: repeated Q:/A: pairs are unmistakable.
  if (count(text, /^\s*q[:.)]/gim) >= 2 && count(text, /^\s*a[:.)]/gim) >= 2) {
    return { category: "faqs", title: "Pasted FAQs" };
  }

  // Email thread: headers or reply framing.
  if (
    count(text, /^\s*(from|to|subject)\s*:/gim) >= 2 ||
    /^\s*(re|fwd)\s*:/im.test(text) ||
    /\bemail thread\b/i.test(lower)
  ) {
    return { category: "emails", title: "Email Thread" };
  }

  // Call transcript: speaker-labelled dialogue lines.
  if (
    count(text, /^\s*(rep|agent|customer|caller|homeowner|prospect|lead)\s*:/gim) >= 2 ||
    /\bcall transcript\b/i.test(lower)
  ) {
    return { category: "calls", title: "Call Transcript" };
  }

  // Video transcript: says so explicitly (otherwise indistinguishable from prose).
  if (/\bvideo transcript\b|\bwebinar transcript\b|\byoutube\b/i.test(lower)) {
    return { category: "videos", title: "Video Transcript" };
  }

  // Product catalog: several priced line items or an explicit catalog header.
  if (
    /\b(product|service)s?\s*(&|and)?\s*(catalog|price list|pricing list)\b/i.test(lower) ||
    (count(text, /\$\s?\d[\d,]*/g) >= 3 && count(text, /^\s*(\d+[.)]|[-•*])\s/gm) >= 3)
  ) {
    return { category: "catalog", title: "Product Catalog" };
  }

  // Sales script: coaching/rebuttal language aimed at reps.
  if (
    /\bsales script\b|\bscript notes\b|\bobjection\b|\brebuttal\b/i.test(lower) ||
    count(text, /\b(say|respond|reply with|never say|always offer)\s*[:"]/gi) >= 2
  ) {
    return { category: "scripts", title: "Sales Script" };
  }

  // Default: plain business facts read best as a document, not a script.
  return { category: "documents", title: "Business Notes" };
}
