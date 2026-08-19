import type { JobSpec } from "@/lib/assistant.shared";
import { defaultRecordTypeLabelForTemplate } from "@/lib/record-types";

/** Which source kinds a toggle applies to. */
export type SourceKind = NonNullable<JobSpec["sourceType"]>;

// ---------------------------------------------------------------------------
// Output type axis. The catalog holds two different products: sources that
// produce CONTACTABLE LEADS (they earn the compliance pipeline and a campaign
// launch) and sources that produce a RESEARCH DATASET (flight prices, sports
// scores, product listings, headlines). For data sources the whole pipeline
// vocabulary — skip trace, DNC scrub, "clean textable leads", Launch Estimate
// — is nonsense, so they get dedupe + export and nothing else.
// ---------------------------------------------------------------------------

export type OutputType = "leads" | "data";

export const DATA_TEMPLATE_IDS: readonly string[] = [
  // E-commerce product catalogs (the merchant is not the deliverable here)
  "amazon-products", "aliexpress", "target", "bestbuy", "homedepot", "wayfair",
  "newegg", "costco", "shein", "temu",
  // Travel prices
  "kayak", "skyscanner",
  // Sports
  "espn", "sofascore", "flashscore",
  // News
  "google-news", "bing-news", "reuters",
  // Finance
  "yahoo-finance", "google-finance", "sec-edgar",
  // Education catalogs
  "coursera", "udemy", "edx", "google-scholar",
  // Author-based social + app reviews + review enrichment
  "reddit", "pinterest", "quora", "threads", "appstore", "playstore", "google-reviews",
];

export function templateOutputType(templateId?: string | null): OutputType {
  return templateId && DATA_TEMPLATE_IDS.includes(templateId) ? "data" : "leads";
}

export function isDataSource(templateId?: string | null): boolean {
  return templateOutputType(templateId) === "data";
}

/** Non-US portals and marketplaces, with the country the source implies. */
export const INTERNATIONAL_TEMPLATE_COUNTRY: Record<string, string> = {
  rightmove: "United Kingdom",
  zoopla: "United Kingdom",
  idealista: "Spain",
  cylex: "United Kingdom",
  hotfrog: "United Kingdom",
  alibaba: "China",
  mercadolibre: "Mexico",
  flipkart: "India",
  agoda: "Thailand",
};

export function isInternationalTemplate(templateId?: string | null): boolean {
  return Boolean(templateId && templateId in INTERNATIONAL_TEMPLATE_COUNTRY);
}

export function defaultCountryFor(templateId?: string | null): string | null {
  return (templateId && INTERNATIONAL_TEMPLATE_COUNTRY[templateId]) || null;
}

/** A run is US-only-SMS eligible unless its geography leaves the US. */
export function isNonUsRun(opts: { templateId?: string | null; country?: string | null }): boolean {
  if (isInternationalTemplate(opts.templateId)) return true;
  const c = (opts.country ?? "").trim().toLowerCase();
  if (!c) return false;
  return !["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america", "america"].includes(c);
}

/** Marketplace SELLER templates: the merchant is the lead, and email is the field. */
export const SELLER_TEMPLATE_IDS: readonly string[] = [
  "amazon", "ebay", "etsy", "walmart", "shopify", "alibaba",
];

/** US real-estate portals, where the lead is either the agent or the owner. */
export const US_REALESTATE_PORTAL_IDS: readonly string[] = [
  "zillow", "redfin", "realtor", "trulia",
];

/** Job boards. The lead is the EMPLOYER, not the posting. */
export const JOB_BOARD_TEMPLATE_IDS: readonly string[] = [
  "indeed", "googlejobs", "glassdoor", "ziprecruiter", "linkedin-jobs",
  "monster", "simplyhired", "dice",
];

export function isJobBoard(templateId?: string | null): boolean {
  return Boolean(templateId && JOB_BOARD_TEMPLATE_IDS.includes(templateId));
}

/**
 * The Google Maps Businesses template. Its card promises franchises removed,
 * so franchise removal defaults ON for this source only.
 */
export const GMAPS_TEMPLATE_ID = "gmaps";

/**
 * Enrichment profiles. Phone enrichment is not universal:
 * - creator: TikTok / Instagram / YouTube style sources. The deliverable is
 *   email + profile + engagement. Creator outreach runs on email and DMs, and
 *   cold-texting individuals is a TCPA consent problem we don't take on, so
 *   skip trace and mobile filtering are hidden entirely here.
 * - b2b: LinkedIn style prospecting, where a decision-maker's direct dial is
 *   legitimately valuable. Skip trace stays visible, but defaults OFF.
 * - seller: marketplace merchants (Amazon/Etsy/Shopify sellers). Email-first,
 *   same shape as creators.
 * - portal: US real-estate portals. Skip trace only makes sense for the
 *   For-Sale-By-Owner target, so it's gated on that choice.
 * - data: research datasets. No enrichment at all.
 * - standard: business + public records + uploads. Phones are the product.
 */
export type EnrichmentProfile = "creator" | "b2b" | "seller" | "portal" | "data" | "standard";

/** Whose contact details a real-estate portal run should target. */
export type ContactTarget = "agents" | "fsbo";

/** Creator templates (including hashtag/search variants). */
export const CREATOR_TEMPLATE_IDS: readonly string[] = [
  "tiktok",
  "tiktok-hashtag",
  "instagram",
  "instagram-hashtag",
  "youtube",
  "youtube-search",
];

/** B2B prospecting templates where direct dials matter. */
export const B2B_TEMPLATE_IDS: readonly string[] = ["linkedin"];

export function enrichmentProfile(templateId?: string | null): EnrichmentProfile {
  if (!templateId) return "standard";
  if (DATA_TEMPLATE_IDS.includes(templateId)) return "data";
  if (CREATOR_TEMPLATE_IDS.includes(templateId)) return "creator";
  if (SELLER_TEMPLATE_IDS.includes(templateId)) return "seller";
  if (US_REALESTATE_PORTAL_IDS.includes(templateId)) return "portal";
  if (B2B_TEMPLATE_IDS.includes(templateId)) return "b2b";
  return "standard";
}

export function isCreatorSource(templateId?: string | null): boolean {
  return enrichmentProfile(templateId) === "creator";
}

export type PipelineOption = {
  id: "skipTrace" | "removeFranchises" | "dedupe" | "mobileOnly" | "emailRequired";
  label: string;
  /** Plain-language explanation surfaced by the "?" hint in the List Builder. */
  hint: string;
  defaultOn: boolean;
  sourceKinds: readonly SourceKind[];
  /** Which enrichment profiles show this toggle at all. */
  profiles: readonly EnrichmentProfile[];
  /** Shorter label used by the Assembling checklist when it differs. */
  checklistLabel?: string;
  /** Per-profile overrides for wording and default state. */
  overrides?: Partial<Record<EnrichmentProfile, Partial<Pick<PipelineOption, "label" | "hint" | "defaultOn">>>>;
};

/**
 * Single source of truth for the four pipeline toggles. The List Builder
 * panel, the assembly checklist, the "You Edited" chips, and any toast all
 * read their wording from here, so the panel and the checklist can be
 * compared word-for-word, top to bottom.
 *
 * Order matters: the checklist renders enabled toggles in this exact order.
 */
export const PIPELINE_OPTIONS: readonly PipelineOption[] = [
  {
    id: "skipTrace",
    label: "Skip Trace Missing Numbers",
    hint: "When a record has no phone number, we look one up from public and licensed data. Skip trace is metered separately from your plan allowance.",
    defaultOn: true,
    sourceKinds: ["business", "records", "upload", "street_scan"],
    profiles: ["standard", "b2b", "portal"],
    overrides: {
      b2b: {
        defaultOn: false,
        hint: "Find direct dials for decision-makers (uses skip-trace credits).",
      },
      portal: {
        defaultOn: true,
        label: "Skip Trace Owners",
        hint: "For-Sale-By-Owner records rarely publish a phone number, so we look one up from public and licensed data. Skip trace is metered separately.",
      },
    },
  },
  {
    id: "emailRequired",
    label: "Only Creators With Contact Email",
    checklistLabel: "Email Required",
    hint: "Keeps only creators who publish a contact email, since creator outreach runs on email and DMs. We never text creators' personal cell phones.",
    defaultOn: true,
    sourceKinds: ["business", "records", "upload", "street_scan"],
    profiles: ["creator", "seller"],
    overrides: {
      seller: {
        label: "Only Sellers With Contact Email",
        hint: "Keeps only merchants who publish a contact email. Marketplace seller outreach runs on email, not cold calls.",
      },
    },
  },
  {
    id: "removeFranchises",
    label: "Remove Franchises",
    hint: "Filters out national chains and franchise locations so you're left with independent, owner-operated businesses.",
    defaultOn: false,
    sourceKinds: ["business"],
    profiles: ["standard"],
  },
  {
    id: "dedupe",
    label: "Dedupe Against Past Lists",
    hint: "Removes anyone already in your Leads library, so you never pay for or text the same person twice.",
    defaultOn: true,
    sourceKinds: ["business", "records", "upload", "street_scan"],
    profiles: ["creator", "b2b", "seller", "portal", "data", "standard"],
    overrides: {
      data: {
        label: "Dedupe Against Past Runs",
        hint: "Removes records you already pulled in an earlier run of this source, so the dataset stays unique.",
      },
    },
  },
  {
    id: "mobileOnly",
    label: "Mobile Numbers Only",
    hint: "Runs a line-type check and keeps only mobile numbers — landlines and VoIP can't receive texts reliably.",
    defaultOn: true,
    sourceKinds: ["business", "records", "upload", "street_scan"],
    profiles: ["standard", "b2b", "portal"],
  },
];

export type PipelineOptionId = PipelineOption["id"];

export const PIPELINE_OPTION_LABELS: Record<PipelineOptionId, string> = PIPELINE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.id]: o.label }),
  {} as Record<PipelineOptionId, string>,
);

/** Apply a profile's wording/default overrides to an option. */
function resolve(option: PipelineOption, profile: EnrichmentProfile): PipelineOption {
  const o = option.overrides?.[profile];
  return o ? { ...option, ...o } : option;
}

/**
 * Extra context that changes which toggles are honest for a run:
 * - contactTarget: FSBO records need skip trace; listing agents publish phones.
 * - nonUs: SMS is US-only here, so a non-US run is an email-only lead file.
 */
export type OptionContext = {
  contactTarget?: ContactTarget | null;
  nonUs?: boolean;
  country?: string | null;
};

/** Ids visible for a profile + context, before source-kind scoping. */
function visibleIds(profile: EnrichmentProfile, ctx: OptionContext): PipelineOptionId[] {
  // Research datasets never carry enrichment.
  if (profile === "data") return ["dedupe"];
  const nonUs = ctx.nonUs === true;
  // SMS is US-only, so a non-US run is an email-only lead file: no line-type
  // check, no skip trace against US phone data.
  if (nonUs) return ["emailRequired", "dedupe"];
  if (profile === "creator" || profile === "seller") return ["emailRequired", "dedupe"];
  if (profile === "portal") {
    // Listing agents publish their phone numbers; owners do not.
    return ctx.contactTarget === "fsbo"
      ? ["skipTrace", "dedupe", "mobileOnly"]
      : ["dedupe", "mobileOnly"];
  }
  return PIPELINE_OPTIONS.filter((o) => o.profiles.includes(profile)).map((o) => o.id);
}

/** The non-US email requirement borrows the creator toggle with honest wording. */
function contextOverride(option: PipelineOption, ctx: OptionContext): PipelineOption {
  if (ctx.nonUs && option.id === "emailRequired") {
    return {
      ...option,
      label: "Only Records With Contact Email",
      checklistLabel: "Email Required",
      hint: "SMS launches are US-only, so non-US runs are delivered as an email-ready file. This keeps only records with a contact email.",
      defaultOn: true,
    };
  }
  return option;
}

/**
 * Toggles that should render, in canonical order. Visibility is both
 * source-kind aware and enrichment-profile aware: creator sources never see
 * skip trace or mobile filtering, and see the email requirement instead.
 */
export function optionsForSource(
  sourceType: JobSpec["sourceType"],
  templateId?: string | null,
  ctx: OptionContext = {},
): readonly PipelineOption[] {
  const profile = enrichmentProfile(templateId);
  const allowed = new Set(visibleIds(profile, ctx));
  const inProfile = PIPELINE_OPTIONS.filter((o) => allowed.has(o.id));
  const scoped = sourceType
    ? inProfile.filter((o) => o.sourceKinds.includes(sourceType))
    : inProfile.filter((o) => resolve(o, profile).defaultOn);
  return scoped.map((o) => contextOverride(resolve(o, profile), ctx));
}

/** Context implied by the spec itself (contact target + geography). */
export function specOptionContext(spec: JobSpec): OptionContext {
  return {
    contactTarget: spec.contactTarget,
    country: spec.country,
    nonUs: isNonUsRun({ templateId: spec.templateId, country: spec.country }),
  };
}

/**
 * Enabled toggles for the checklist. Default-off toggles only appear when the
 * user (or the assistant) actually turned them on.
 */
export function enabledOptions(spec: JobSpec): readonly PipelineOption[] {
  return optionsForSource(spec.sourceType, spec.templateId, specOptionContext(spec)).filter((o) => spec[o.id]);
}

/**
 * Toggles that are relevant to the selected source but currently OFF. The
 * checklist renders these as empty checkboxes: offered, not happening. Nothing
 * mentions them conversationally — their presence in the list is the affordance.
 */
export function availableOptions(spec: JobSpec): readonly PipelineOption[] {
  return optionsForSource(spec.sourceType, spec.templateId, specOptionContext(spec)).filter((o) => !spec[o.id]);
}

/**
 * Snap a spec's toggles onto the defaults of the selected source's profile.
 * Called whenever a template is picked so a creator source never carries a
 * stale skipTrace/mobileOnly true, and LinkedIn starts with skip trace off.
 */
export function withEnrichmentDefaults(spec: JobSpec, templateId?: string | null): JobSpec {
  const id = templateId ?? spec.templateId;
  const next = { ...spec };
  const ctx: OptionContext = {
    contactTarget: spec.contactTarget,
    country: spec.country ?? defaultCountryFor(id),
    nonUs: isNonUsRun({ templateId: id, country: spec.country ?? defaultCountryFor(id) }),
  };
  const visible = optionsForSource(spec.sourceType ?? "business", id, ctx);
  for (const option of PIPELINE_OPTIONS) {
    const shown = visible.find((v) => v.id === option.id);
    next[option.id] = shown ? shown.defaultOn : false;
  }
  // A non-US source is a country, not a US state/county. Pre-fill the country
  // the source implies and drop any stale US geography.
  next.country = ctx.country ?? null;
  if (ctx.nonUs) {
    next.state = null;
    next.states = [];
    next.counties = [];
  }
  // Only US real-estate portals ask whose details to collect.
  if (!US_REALESTATE_PORTAL_IDS.includes(id ?? "")) next.contactTarget = null;
  // Job-board runs are only useful when fresh; the posting date is the trigger.
  if (isJobBoard(id) && !next.recencyDays) next.recencyDays = 30;
  // A records preset that serves exactly one filing pre-fills its Record Type,
  // so the Assembling checklist never waits on a slot the Source already
  // decides. The operator can still change it in the dropdown. Templates that
  // serve many types (the Distress Feed) return null and are left untouched.
  if (next.sourceType === "records" && !next.recordType) {
    const implied = defaultRecordTypeLabelForTemplate(id);
    if (implied) next.recordType = implied;
  }
  // Franchise removal stays a user-controlled toggle, off unless turned on.
  return next;
}
