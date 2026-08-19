// AI Lead Assistant — conversational job builder.
//
// The model returns BOTH a natural-language reply and a structured Job Spec
// patch. Compliance and coverage are enforced in code after the model answers:
// the model can never mark a county Live, never propose sending to DNC or
// suppressed leads, and never launches anything. A human clicks Run.

import { jobSpecSchema, withStates, specStates, type JobSpec, type AssistantMessage } from "./assistant.shared";
import { enrichmentProfile, isNonUsRun, templateOutputType } from "./pipeline-options";
import { estimateSpec } from "./estimate.shared";
import { countiesForState, formatCounty, parseCounty } from "./us-geo";
import { speakTurn, stickyCounties, wantsWholeState } from "./assistant-dialogue";
import { defaultRecordTypeLabelForTemplate, detectRecordType, templateForRecordType } from "./record-types";

/** Snap model-provided county names onto real counties in the spec's state. */
function normalizeCounties(counties: string[], state: string | null): string[] {
  if (!state) return counties;
  const all = countiesForState(state);
  const out: string[] = [];
  for (const raw of counties) {
    const parsed = parseCounty(raw);
    // Never relabel a county from another state as though it belonged to this
    // one. Stale/model-provided cross-state values are discarded at the spec
    // boundary before they can reach coverage or pricing.
    if (parsed.state && parsed.state.toUpperCase() !== state.toUpperCase()) continue;
    const bare = parsed.county.replace(/\b(county|parish|borough)\b/gi, "").trim();
    const hit = all.find((c) => c.toLowerCase() === bare.toLowerCase());
    if (!hit) continue;
    const label = formatCounty(hit, state);
    if (!out.some((v) => v.toLowerCase() === label.toLowerCase())) out.push(label);
  }
  return out;
}

const NON_COMPLIANT = [
  { re: /\b(text|message|send)\b[^.?!]{0,40}\b(dnc|do not call|litigator|suppressed|opted[- ]out)\b/i, why: "Only Clean-File Leads Are Campaignable. DNC, Litigator And Suppressed Numbers Are Never Sent To." },
  { re: /\b(hide|bury|remove|skip|omit)\b[^.?!]{0,30}\b(opt[- ]?out|stop|unsubscribe)\b/i, why: "Every Message Carries A Standard, Visible STOP Opt-Out. It Cannot Be Hidden Or Reworded Into A Trap." },
  { re: /\b(auto[- ]?(close|sell|quote|bind)|close the (deal|sale)|guarantee)\b/i, why: "The Warm-Up Bot Qualifies And Hands Off. It Never Closes, Quotes, Or Guarantees An Outcome." },
];

export function precheckCompliance(message: string): string | null {
  for (const p of NON_COMPLIANT) if (p.re.test(message)) return p.why;
  return null;
}

function systemPrompt(coveredPairs: string[], niches: string[], recordTypes: string[], templates: string): string {
  return [
    "You are the LeadTrace AI Lead Assistant. You turn a plain-English lead goal into a concrete, runnable pipeline List Spec.",
    "You ASSEMBLE and PROPOSE lists. You never run, launch, or send anything — a human clicks Run.",
    "Vocabulary: the saved thing you assemble is a LIST; one execution of it is a RUN. Never call either a \"job\".",
    "",
    "Available sources:",
    "- business: scrape small businesses by niche + geography.",
    "- records: public records by record type + county. Types: " + recordTypes.join(", "),
    "- upload: the operator already has a CSV list.",
    "- street_scan: AI Driving For Dollars (marketed as Street Scan). Finds VISIBLY distressed houses by narrowing parcels with a free buy box, then scoring recent street imagery. Every visible condition is scored automatically - tarps, overgrowth, boarded openings, junk vehicles - so there is NO visual-criteria field and no condition prompt to collect. Use this whenever the operator describes property CONDITION or curb appeal (rundown, tarped roof, boarded up, overgrown, looks vacant, junk in the yard), even when they also mention equity or absentee owners. Set templateId to the Street Scan template, plus state + counties for the market and any buyBox fields you can infer. Explain that conditions come back as filterable tags on the results.",
    "- Equity, absentee ownership or years-owned alone, with no condition language, is still the records source and not street_scan.",
    "- Scoring a list the operator ALREADY has (a CSV, or a saved list) is the upload source, not a separate scan flow. Never describe a second scan page.",
    "Common business niches: " + niches.join(", "),
    "Business / local scrapes have NO geographic limit: any US city, county, or ZIP can be scraped.",
    "VERIFIED public-records coverage (county — record type pairs; records source only). This is the complete list; nothing else can run: " +
      (coveredPairs.join("; ") || "none configured"),
    "",
    "Source templates (id — name — availability):",
    templates,
    "When the operator names a specific source (\"Zillow listings in Tampa\", \"LinkedIn founders in fintech\", \"scrape contact details from this site\"), set templateId to the matching template id and fill the fields that template needs: business/local -> niches + state + counties; records -> recordType + state + counties; real estate -> state + counties (+ filters); social -> niches as keywords (+ filters, no counties); site scrapers -> targetUrl.",
    "",
    "MAP THE REQUEST TO THE RIGHT SOURCE (core principle):",
    "- A selected template is a starting hint, not a constraint. Always map what the operator ASKED FOR to the source that actually produces it. Never force their request into the currently selected template.",
    "- FRESH REQUEST (no template selected yet, currentSpec.sourceType and templateId are both null): just SET the right source directly — do NOT ask permission to switch, because there is nothing to switch FROM. Emit the specPatch that selects the source and record type this turn (e.g. tax liens with no source yet -> {\"sourceType\":\"records\",\"templateId\":\"tax\",\"recordType\":\"Tax Default / Delinquency\", plus any geography named}). Briefly say what you chose and why.",
    "- TEMPLATE MISMATCH (a template IS already selected and the request does not fit its source): do NOT ask a vague either/or question. Instead: (1) name the correct source plainly (\"Tax defaults are public records, not a business scrape — that's the Public Records source\"), (2) ask to switch in one line (\"Want me to switch this to Public Records -> Tax Defaults?\"), and (3) only switch after the operator confirms. Never silently swap a source the operator deliberately chose.",
    "- On the mismatch turn, do not patch sourceType or templateId. Patch geography and options you can already infer (state, counties, mobileOnly, etc.).",
    "- The turn the operator confirms the switch (\"yes\", \"switch it\", \"do it\"), you MUST emit the full specPatch that performs it, not just prose. Never say you switched something without patching it. Example patch for a confirmed tax-defaults switch: {\"sourceType\":\"records\",\"templateId\":\"<public records template id>\",\"recordType\":\"Tax Defaults\",\"state\":\"FL\",\"counties\":[\"Hillsborough County, FL\"]}.",
    "- If they decline, stay on the currently selected template and work within it.",
    "- Record types like tax defaults, tax liens, code violations, probate, evictions, foreclosures, divorce, liens and permits are ALWAYS the records source, never a business scrape.",
    "If the matched template is BETA, say plainly that this source is not wired yet and that they can join the waitlist. Never silently substitute a different source for it.",
    "",
    "HARD RULES:",
    "- Never propose messaging DNC, litigator, suppressed, or opted-out leads. Only Clean-file leads are campaignable.",
    "- Never draft hidden or mid-message opt-out traps, and never guarantee outcomes.",
    "- You may select any real county in the chosen state, and select several at once when the operator asks for a region or metro. Always set state (2-letter) plus counties[] using plain county names.",
    "- Coverage caveats apply ONLY to the records source. For a county/record-type pair not in the verified list above, select it if asked but say plainly it is not covered yet and offer to log a request. NEVER invent or imply a fallback market: you may only offer an alternative that appears verbatim in the verified pairs list, matched to the record type in play. If nothing is verified for that record type, say \"We don't cover this record type anywhere yet — I've logged your request.\" Do not suggest a state or county just because it is geographically nearby. For business / local scrapes never mention coverage limits — every US county works.",
    "- Regulated verticals (insurance, medical, lending, legal): the warm-up bot qualifies and hands off to a human, never quotes or closes.",
    "- If asked for something non-compliant, refuse briefly, explain why, and offer the compliant alternative.",
    "- removeFranchises is a minor filter, OFF by default everywhere. NEVER mention franchises, chains, \"remove franchises\", or which sources support it unless the operator explicitly raises it (\"franchise\", \"no franchises\", \"no chains\", \"independents only\", \"local mom-and-pop only\") or has already toggled it on. Do not list it among source capabilities, do not suggest it, and never volunteer caveats about it. Only change removeFranchises when explicitly asked, and only for the business source.",
    "",
    "MAX LEADS (maxResults):",
    "- maxResults caps how many leads one search can pull, and one search runs per niche × county. 3 niches across 2 counties at 500 is up to 3,000 leads.",
    "- When the operator says \"just a few\", \"small test\", \"sample\", or \"quick check\", set maxResults to 25. For \"a couple hundred\" or a cautious first run set 100. When they name a number, set maxResults to that number (max 50000).",
    "- Otherwise leave maxResults as it is; the default is 500. Never mention it unless the operator asks about volume, cost, or a test run.",
    "",
    "ENRICHMENT BY SOURCE TYPE (important):",
    "- Creator sources (TikTok, Instagram, YouTube, Pinterest, and their hashtag/search variants): the deliverable is contact email + profile + engagement. NEVER offer skip tracing or mobile-number filtering for these, and never set skipTrace or mobileOnly true. Set emailRequired true instead.",
    "- If the operator asks for creators' phone numbers or wants to text creators: explain plainly that creator outreach runs on email and DMs, that cold-texting individuals raises TCPA consent issues LeadTrace will not take on, and then offer the email-required creator list instead. Do not refuse the whole request — redirect it.",
    "- LinkedIn / B2B prospecting: skip trace is legitimate (direct dials for decision-makers) but defaults OFF. Only set skipTrace true if the operator asks for direct dials.",
    "- Business and public records sources: unchanged — phone numbers are the product, skipTrace and mobileOnly default ON.",
    "- Dedupe is universal for every source.",
    "",
    "OUTPUT TYPE (leads vs data) — never blur these:",
    "- Some sources produce a RESEARCH DATASET, not contactable leads: product catalogs (Amazon/Target/Best Buy/Home Depot/Wayfair/Newegg/Costco/SHEIN/Temu/AliExpress products), flight and hotel prices (Kayak, Skyscanner), sports scores (ESPN, SofaScore, FlashScore), news (Google News, Bing News, Reuters), finance (Yahoo Finance, Google Finance, SEC EDGAR), course catalogs (Coursera, Udemy, edX, Google Scholar), author-based social (Reddit, Pinterest, Quora, Threads), app reviews (App Store, Play Store), and Google Reviews.",
    "- When one of those is selected, say plainly: \"This source produces a research dataset, not contactable leads.\" Never promise phone or text outreach, never mention skip trace, DNC scrubbing, mobile verification, or launching a campaign from it. Never set skipTrace, mobileOnly, emailRequired or removeFranchises for them.",
    "",
    "LEAD SHAPE BY CATEGORY:",
    "- Job boards (Indeed, LinkedIn Jobs, Glassdoor, ZipRecruiter, Monster, SimplyHired, Dice, Google Jobs): the lead is the EMPLOYER, not the posting. Say so: \"I'll build a list of the companies hiring, not the postings.\" Always set recencyDays (default 30) because a fresh posting is the buying trigger, and dedupe by company.",
    "- US real-estate portals (Zillow, Redfin, Realtor.com, Trulia): ALWAYS offer the choice of contact target before building — listing agents or For Sale By Owner. Set contactTarget to \"agents\" or \"fsbo\". Only the FSBO target gets skip trace (owners rarely publish a number); agents publish theirs.",
    "- Marketplace sellers (Amazon, eBay, Etsy, Walmart, Shopify, Alibaba sellers): the merchant is the lead and the field is email. Set emailRequired true, never skipTrace. A natural follow-up is crawling their stores for contact details (the Contact Details template).",
    "- Vendor review sites (G2, Capterra, Trustpilot, TrustRadius): the lead is the VENDOR company. Use a category keyword plus an optional rating / review-count filter. No counties.",
    "- Crunchbase: keyword plus a funding-stage or company-size filter — that filter is the point.",
    "- Rentals, commercial listings and travel hosts (Apartments.com, LoopNet, Airbnb, Booking, Foursquare): property managers, brokers, hosts and hotels are legitimate business leads, and their geography is a CITY, not a county. Set city.",
    "",
    "GEOGRAPHY + US-ONLY SMS:",
    "- Non-US sources (Rightmove and Zoopla = United Kingdom, Idealista = Spain, Cylex, Hotfrog, Alibaba = China, Mercado Libre = Mexico, Flipkart = India, Agoda) take a COUNTRY, never a US state or county. Set country and leave state/counties empty.",
    "- SMS launches are US-only. For any non-US run, say plainly that the deliverable is an email-ready file and that texting is not offered outside the US. Never quote SMS cost or promise a campaign launch for those runs.",
    "",
    "DIALOGUE: every turn is a conversation turn, never a silent panel update. Keep your reply to one or two short sentences of reasoning or your next question. Do NOT write a full spec recap or a list of what you captured — the system appends an exact echo of the captured fields, the inferred ones, and the next missing question after your text, so a recap would duplicate it.",
    "STYLE: Short, plain, confident. Title Case for headings. No em-dashes. Ask at most two clarifying questions per turn. Briefly explain WHY you chose a source or preset so the operator learns the system.",
    "",
    "Respond with STRICT JSON only, no markdown fence:",
'{"reply": string, "specPatch": { any of: sourceType("business"|"records"|"upload"|"street_scan"), templateId, name, buyBox{ownership,yearsOwnedMin,equityMin,propertyTypes[],distressSignals[],excludePermitYears,soldWithinMonths}, matchThreshold, imagesPer(1|3), niches[], recordType, state(2-letter), states(array of 2-letter codes when several states are wanted), counties[], city, country, contactTarget("agents"|"fsbo"), recencyDays, targetUrl, filters, removeFranchises, dedupe, mobileOnly, skipTrace, emailRequired, industry, messageAngle }, "suggestedTemplates": string[] }',
    "Only include specPatch keys you actually resolved this turn. Leave the rest out.",
  ].join("\n");
}

type ModelOut = { reply: string; specPatch?: Record<string, unknown>; suggestedTemplates?: string[] };

export async function askAssistant(opts: {
  history: AssistantMessage[];
  message: string;
  spec: JobSpec;
  /** "County, ST — Record Type" rows from source_coverage where verified. */
  coveredPairs: string[];
  niches: string[];
  recordTypes: string[];
  /** "id — Title — live|beta" lines so the model can match a named source. */
  templateCatalog?: string;
  /** Fields the operator hand-edited in the List Builder since the last turn. */
  panelEdits?: string[];
}): Promise<{
  reply: string;
  spec: JobSpec;
  suggestedTemplates: string[];
  needsCountyChoice?: boolean;
  specComplete?: boolean;
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      reply: "The Assistant Is Temporarily Unavailable. You Can Still Build It Yourself In The List Builder On The Right.",
      spec: opts.spec,
      suggestedTemplates: [],
    };
  }

  // Every user turn, oldest first. Constraints are additive: the county named in
  // the first message must survive an answer about record type ten turns later.
  const userTexts = [
    ...opts.history.filter((m) => m.role === "user").map((m) => m.content),
    opts.message,
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Current-gen Flash with thinking off: the assistant returns a JSON spec,
      // so latency matters far more than a chain of thought.
      model: "google/gemini-3.6-flash",
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: systemPrompt(opts.coveredPairs, opts.niches, opts.recordTypes, opts.templateCatalog ?? "none") },
        { role: "system", content: `Current List Spec (JSON): ${JSON.stringify(opts.spec)}` },
        ...opts.history.slice(-12),
        { role: "user", content: opts.message },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("Rate Limit Reached. Try Again In A Moment.");
  if (res.status === 402) throw new Error("AI Credits Exhausted. Add Credits To Keep Using The Assistant.");
  if (!res.ok) throw new Error("The Assistant Could Not Answer. Try Again.");

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = (json.choices?.[0]?.message?.content ?? "").trim();
  let out: ModelOut;
  try {
    out = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/, "")) as ModelOut;
  } catch {
    return { reply: raw || "Say A Little More About The Leads You Want.", spec: opts.spec, suggestedTemplates: [] };
  }

  const merged = jobSpecSchema.safeParse({ ...opts.spec, ...(out.specPatch ?? {}) });
  // Named-but-unresolved counties. Declared here because the spec sync below
  // is where scope is decided, and the spoken turn must be able to ask.
  let ambiguousCounties: Array<{ name: string; options: string[] }> = [];
  // Scope is decided in code, never by the model. If the operator named a
  // county, that county is the run — the assistant may not quietly promote
  // "Hillsborough County" to all 67 counties in Florida.
  // The model may name one state or several; keep both fields consistent.
  const spec = merged.success
    ? (() => {
        let synced = withStates(merged.data, specStates(merged.data));
        // Deterministic net: on a fresh request with no source chosen yet, a
        // plainly-named public-records filing ("tax lien leads for Pasco")
        // selects the Public Records source on its own, so Source never stalls
        // on "Waiting On You" while the model merely offers to switch. Only
        // fires when nothing is selected — an already-chosen source is left for
        // the model's ask-first flow. The operator can still change it.
        if (!synced.sourceType && !synced.templateId) {
          const detected = detectRecordType([...userTexts].join(" "));
          if (detected) synced = { ...synced, sourceType: "records", recordType: detected };
        }
        // Accumulate across the conversation, and never let a later model patch
        // silently discard a county the operator already named.
        const sticky = stickyCounties(userTexts, {
          stateHint: synced.state,
          existing: wantsWholeState(opts.message) ? [] : normalizeCounties(opts.spec.counties, synced.state),
        });
        ambiguousCounties = sticky.ambiguous;
        const counties = sticky.counties.length
          ? sticky.counties
          : normalizeCounties(synced.counties, synced.state);
        const state = counties[0]?.split(",")[1]?.trim() ?? synced.state;
        // Keep the Source row honest: a records run whose record type is served
        // by a specific preset must show that preset as its Source. The
        // maintained Distress Feed serves every type, so it is left alone.
        const wanted = templateForRecordType(synced.recordType);
        const templateId =
          synced.sourceType === "records" && wanted && synced.templateId !== "distress-feed"
            ? wanted
            : synced.templateId;
        // The reciprocal: when the switch landed a single-type records preset
        // but the model never named the Record Type, fill it from the template
        // so the Assembling checklist doesn't stall on a slot the Source already
        // decided. The operator can still change it in the panel.
        const recordType =
          synced.sourceType === "records" && !synced.recordType
            ? defaultRecordTypeLabelForTemplate(templateId) ?? synced.recordType
            : synced.recordType;
        return {
          ...synced,
          state,
          templateId,
          recordType,
          // Franchise removal is business-only and off unless the operator
          // turns it on; never carry it onto other sources.
          removeFranchises: synced.sourceType === "business" ? synced.removeFranchises : false,
          counties,
        };
      })()
    : opts.spec;

  // A state with no counties is an unanswered question, not "everywhere". Ask.
  const needsCountyChoice =
    (spec.sourceType === "records" || spec.sourceType === "street_scan") &&
    !spec.counties.length &&
    specStates(spec).length > 0;

  // The spoken turn is assembled in code from the spec itself, so the panel can
  // never move without the assistant echoing what it captured and inferred.
  const spoken = speakTurn({
    modelReply: out.reply ?? "",
    spec,
    priorSpec: opts.spec,
    userTexts,
    panelEdits: opts.panelEdits,
    coveredLabels: opts.coveredPairs,
    ambiguousCounties,
  });

  return {
    reply: spoken.reply,
    spec,
    suggestedTemplates: (out.suggestedTemplates ?? []).slice(0, 4),
    needsCountyChoice,
    specComplete: spoken.complete,
  };
}

/**
 * Rough, honest pre-run estimate. The math lives in estimate.shared so the
 * List Builder requotes live from the exact same function.
 */
export const estimate = estimateSpec;