import { describe, expect, it } from "vitest";
import { classifyKnowledge } from "@/lib/knowledge-classify";

describe("classifyKnowledge", () => {
  it("detects Q/A pairs as FAQs", () => {
    const text = "Q: Are you licensed?\nA: Yes, CCC-1331542.\n\nQ: Do you finance?\nA: Yes, 12 months zero interest.";
    expect(classifyKnowledge(text).category).toBe("faqs");
  });

  it("detects email threads by headers", () => {
    const text = "From: Mike\nTo: Homeowner\nSubject: Re: Your roof inspection\nThanks for letting us inspect.";
    expect(classifyKnowledge(text).category).toBe("emails");
  });

  it("detects call transcripts by speaker labels", () => {
    const text = "Customer: My roof is leaking, how fast can you come?\nRep: We offer 24/7 emergency tarping.";
    expect(classifyKnowledge(text).category).toBe("calls");
  });

  it("detects catalogs by priced line items", () => {
    const text =
      "1. Asphalt Shingle Replacement — $9,000 to $16,000\n2. Metal Roof — $18,000 to $35,000\n3. Emergency Tarping — $350 flat";
    expect(classifyKnowledge(text).category).toBe("catalog");
  });

  it("detects sales scripts by rebuttal language", () => {
    const text =
      'Sales script notes: when they say "too expensive", respond: "we offer financing". If they mention a competitor, say: "cheaper quotes mean thinner shingles". Handle the objection calmly.';
    expect(classifyKnowledge(text).category).toBe("scripts");
  });

  it("falls back to documents for plain business facts", () => {
    const text =
      "Summit Roofing was founded in 2012 and has completed over 3,000 roofs across Tampa Bay. Office hours are Monday to Saturday.";
    expect(classifyKnowledge(text).category).toBe("documents");
  });
});
