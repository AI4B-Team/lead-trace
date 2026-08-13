import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Bug,
  Car,
  Check,
  CircleDollarSign,
  CircleCheck,
  Clock,
  Database,
  Droplet,
  Droplets,
  Dumbbell,
  FileSpreadsheet,
  FileText,
  Flame,
  Gavel,
  Globe,
  HardHat,
  HeartPulse,
  Home,
  Landmark,
  Leaf,
  MapPin,
  MessageCircle,
  Radar,
  Receipt,
  Scale,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Smartphone,
  Sparkles,
  Star,
  Stethoscope,
  TreePine,
  Upload,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { TemplateLogo } from "@/components/marketing/template-logo";
import { getTemplate } from "@/lib/templates";
import { PipelineFlow } from "@/components/marketing/pipeline-flow";
import { MiniWorkflow, PillarArrow, PillarCard } from "@/components/marketing/leads-pillars";
import { CONTENT_UPDATED, LEAD_PAGES, REFERENCE_FUNNEL } from "@/lib/lead-pages";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/leads/")({
  head: () => ({
    meta: [
      { title: "Lead Lists You Can Actually Contact | LeadTrace" },
      {
        name: "description",
        content:
          "Mobile-verified, DNC-scrubbed, duplicate-free business lead lists by niche — roofing, HVAC, plumbing, med spas and more. See a sample list before you build one.",
      },
      { property: "og:title", content: "Lead Lists You Can Actually Contact — LeadTrace" },
      {
        property: "og:description",
        content: "Every list is deduplicated, mobile verified, and DNC scrubbed before it reaches you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/leads") }],
  }),
  component: LeadsIndex,
});

const NICHE_FACTS = [
  { icon: Globe, label: "Nationwide Coverage" },
  { icon: Smartphone, label: "Mobile Verified" },
  { icon: ShieldCheck, label: "Clean & Compliant" },
  { icon: Zap, label: "Built On Demand" },
];

const NICHE_CATEGORIES = [
  "Businesses",
  "Property Owners",
  "Public Records",
  "Real Estate",
  "Local Services",
  "Healthcare",
  "Home Services",
];

type NicheEntry = {
  slug: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "business" | "property";
  display?: string;
  /** Small label chip shown on the card. */
  tag?: string;
  /** One-line card description. */
  desc?: string;
  /** Filter groups this niche belongs to. */
  groups?: string[];
};

const NICHE_ORDER: NicheEntry[] = [
  { slug: "roofing-contractors", icon: HardHat, category: "business", display: "Roofing Contractors", tag: "Business", desc: "Find local roofing companies ready for your services.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "hvac-companies", icon: Flame, category: "business", display: "HVAC Companies", tag: "Business", desc: "Target heating & cooling companies in your market.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "plumbers", icon: Droplet, category: "business", display: "Plumbers", tag: "Business", desc: "Connect with plumbing businesses needing more work.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "electricians", icon: Zap, category: "business", display: "Electricians", tag: "Business", desc: "Reach electrical contractors and service pros.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "landscaping", icon: Leaf, category: "business", display: "Landscapers", tag: "Business", desc: "Find landscaping & lawn care businesses.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "pressure-washing", icon: Droplets, category: "business", display: "Pressure Washing", tag: "Business", desc: "Target pressure washing businesses in your area.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "tree-service", icon: TreePine, category: "business", display: "Tree Service", tag: "Business", desc: "Connect with tree removal & arborist companies.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "pest-control", icon: Bug, category: "business", display: "Pest Control", tag: "Business", desc: "Find pest control companies needing new customers.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "cleaning-services", icon: Sparkles, category: "business", display: "Cleaning Service", tag: "Business", desc: "Target cleaning companies & janitorial services.", groups: ["Businesses", "Local Services", "Home Services"] },
  { slug: "dental-offices", icon: Smile, category: "business", display: "Dental Offices", tag: "Business", desc: "Find dental practices & orthodontic offices.", groups: ["Businesses", "Healthcare"] },
  { slug: "med-spas", icon: HeartPulse, category: "business", display: "Med Spas", tag: "Business", desc: "Connect with med spas & aesthetic clinics.", groups: ["Businesses", "Healthcare"] },
  { slug: "auto-repair-shops", icon: Wrench, category: "business", display: "Auto Repair", tag: "Business", desc: "Find auto repair shops and service centers.", groups: ["Businesses", "Local Services"] },
  { slug: "probate-filings", icon: Scale, category: "property", display: "Probate Filings", tag: "Public Record", desc: "Find new probate filings and estate opportunities.", groups: ["Public Records", "Property Owners", "Real Estate"] },
  { slug: "tax-delinquencies", icon: Receipt, category: "property", display: "Tax Delinquencies", tag: "Property", desc: "Locate property tax delinquencies & motivated sellers.", groups: ["Public Records", "Property Owners", "Real Estate"] },
  { slug: "code-violations", icon: FileText, category: "property", display: "Code Violations", tag: "Public Record", desc: "Find property code violations and compliance issues.", groups: ["Public Records", "Property Owners", "Real Estate"] },
  { slug: "vacant-properties", icon: Home, category: "property", display: "Vacant Properties", tag: "Property", desc: "Discover vacant & abandoned properties.", groups: ["Property Owners", "Real Estate"] },
  { slug: "absentee-owners", icon: MapPin, category: "property", display: "Absentee Owners", tag: "Property", desc: "Find absentee & out-of-state property owners.", groups: ["Property Owners", "Real Estate"] },
  { slug: "pre-foreclosures", icon: Gavel, category: "property", display: "Pre-Foreclosures", tag: "Property", desc: "Find pre-foreclosure properties & motivated sellers.", groups: ["Public Records", "Property Owners", "Real Estate"] },
];

/** Level 1 — proprietary LeadTrace intelligence products. */
const FEATURED_FEEDS: {
  to: "/distress-feed" | "/street-scan" | "/surplus-funds";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta: string;
  recordTypes?: string[];
  isNew?: boolean;
}[] = [
  {
    to: "/distress-feed",
    icon: Radar,
    title: "Distress Feed",
    body: "All major distress signals in one feed.",
    cta: "Explore Distress Feed",
    recordTypes: [
      "Probate",
      "Tax Defaults",
      "Pre-Foreclosures",
      "Code Violations",
      "Vacant Properties",
      "Surplus Funds",
    ],
  },
  {
    to: "/street-scan",
    icon: Car,
    title: "Street Scan",
    body: "AI-powered street-level opportunity discovery.",
    cta: "Explore Street Scan",
  },
  {
    to: "/surplus-funds",
    icon: CircleDollarSign,
    title: "Surplus Funds",
    body: "Find unclaimed foreclosure and tax-sale surplus funds.",
    cta: "Explore Surplus Funds",
    isNew: true,
  },
];

/** Level 2 — curated individual lead feeds; everything else lives behind View All. */
const POPULAR_SLUGS = [
  "probate-filings",
  "tax-delinquencies",
  "pre-foreclosures",
  "absentee-owners",
  "vacant-properties",
  "code-violations",
];

const POPULAR_TEMPLATES: NicheEntry[] = POPULAR_SLUGS.map(
  (s) => NICHE_ORDER.find((n) => n.slug === s)!,
).filter(Boolean);

const BUSINESS_NICHES = NICHE_ORDER.filter((n) => n.category === "business").slice(0, 8);

/** Level 3 — external sources, official brand marks only, deliberately compact. */
const DATA_SOURCES: { id: string; label: string; sub: string }[] = [
  { id: "gmaps", label: "Google Maps", sub: "Business Listings" },
  { id: "zillow", label: "Zillow FSBOs", sub: "For-Sale-By-Owner Properties" },
  { id: "linkedin", label: "LinkedIn Companies", sub: "Company + Decision-Maker Profiles" },
  { id: "yelp", label: "Yelp Businesses", sub: "Local Businesses" },
];

/** Benefit cards, sharpest copy first. */
const BENEFIT_ORDER = [
  "ai-built",
  "litigator-scrub",
  "landline-remover",
  "dnc-list-scrubbing",
  "google-maps-lead-finder",
  "sms-lead-outreach",
];

const BENEFIT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "litigator-scrub": ShieldCheck,
  "landline-remover": Smartphone,
  "dnc-list-scrubbing": CircleCheck,
  "google-maps-lead-finder": Globe,
  "sms-lead-outreach": Send,
  "ai-built": Sparkles,
};

/** Outcome-framed headings for the pipeline-stage pages (presentation only). */
const BENEFITS: Record<string, { title: string; body: string }> = {
  "google-maps-lead-finder": {
    title: "Fresh Businesses",
    body: "Lists are generated the moment you ask for them — never resold, never recycled from a database someone bought in 2019.",
  },
  "landline-remover": {
    title: "Only Reach Mobile Phones",
    body: "Every number is carrier-checked, so your texts land on phones people actually carry instead of dying on office landlines.",
  },
  "dnc-list-scrubbing": {
    title: "Better Deliverability",
    body: "Numbers on the National Do Not Call Registry are removed before delivery, with a timestamped record of every check.",
  },
  "litigator-scrub": {
    title: "Reduce TCPA Risk",
    body: "Known serial plaintiffs and TCPA litigators are hard-blocked, so the one number that ends a campaign never enters it.",
  },
  "sms-lead-outreach": {
    title: "More Conversations",
    body: "Send straight from the clean list — merge fields, quiet hours, and automatic opt-out handling included, no export required.",
  },
  "ai-built": {
    title: "AI-Built Lists",
    body: "Describe the leads you want in plain English. LeadTrace automatically selects the best data source, configures the filters, and builds your list in seconds.",
  },
};

function LeadsIndex() {
  return <LeadsIndexBody />;
}

function LeadsIndexBody() {
  const niches = LEAD_PAGES.filter((p) => p.kind === "niche");
  const stages = LEAD_PAGES.filter((p) => p.kind === "stage").sort(
    (a, b) => BENEFIT_ORDER.indexOf(a.slug) - BENEFIT_ORDER.indexOf(b.slug),
  );
  const sample = niches[0]?.rows.slice(0, 4) ?? [];
  const removed = REFERENCE_FUNNEL.found - REFERENCE_FUNNEL.clean;

  return (
    <MarketingLayout>
      {/* Hero — outcome first */}
      <section className="bg-background pt-16 pb-12">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="max-w-xl font-display text-4xl md:text-5xl font-black leading-[1.05] text-foreground">
              Lead Lists You Can Actually Contact.
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Build a new lead list from multiple data sources or upload your own.
              LeadTrace cleans, enriches, verifies, and prepares every list for outreach.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/auth">
                  Build My List <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href="#sample-list">See Sample List</a>
              </Button>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Updated {CONTENT_UPDATED}
              </span>
            </div>
          </div>

          {/* Hero proof: the whole value prop in one card */}
          <div className="rounded-3xl border border-border bg-surface p-6 md:p-8">
            <div className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              A Real Reference Search
            </div>
            <div className="mt-5 flex items-center gap-5">
              <div>
                <div className="font-display text-3xl font-black tabular-nums text-muted-foreground">
                  {REFERENCE_FUNNEL.found.toLocaleString()}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Records Received
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="rounded-2xl border border-primary bg-primary/5 px-5 py-3">
                <div className="font-display text-3xl font-black tabular-nums text-foreground">
                  {REFERENCE_FUNNEL.clean.toLocaleString()}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-primary">
                  Ready To Contact
                </div>
              </div>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              The {REFERENCE_FUNNEL.clean} delivered records are the ones you text. The {removed} removed
              records are why you don't get complaints or demand letters.
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline flow */}
      <section className="border-y border-border bg-surface-muted py-14 text-center">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            How Every List Gets Prepared
          </h2>
          <PipelineFlow stages={REFERENCE_FUNNEL} className="mt-8" />
          <p className="mx-auto mt-8 max-w-none whitespace-nowrap text-sm text-muted-foreground">
            The {REFERENCE_FUNNEL.clean} delivered records are the ones you text — then launch an SMS campaign and replies start coming in.
          </p>
          <p className="mx-auto mt-2 max-w-3xl text-sm text-muted-foreground">
            The {removed} removed records are why you don't get complaints or demand letters.
          </p>
        </div>
      </section>

      {/* Sample list */}
      <section id="sample-list" className="scroll-mt-24 bg-background py-14">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            See Exactly What You Get
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Illustrative sample only. Every exported row is verified, compliant, and ready for outreach.
          </p>
          <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
            LeadTrace combines records from multiple trusted data sources before delivery.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
            <TooltipProvider>
              <table className="w-full min-w-[45rem] table-fixed text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-[20%] px-4 py-3">Business</th>
                    <th className="w-[18%] px-4 py-3">Phone</th>
                    <th className="w-[22%] px-4 py-3">Email</th>
                    <th className="w-[15%] px-4 py-3">Website</th>
                    <th className="w-[10%] px-4 py-3">Verified</th>
                    <th className="w-[15%] px-4 py-3">City</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.map((r) => {
                    const domain = r.website
                      .replace(/^https?:\/\//, "")
                      .replace(/^www\./, "")
                      .split("/")[0];
                    return (
                      <tr key={r.business} className="border-b border-border/60 last:border-0">
                        <td className="w-[20%] px-4 py-3 font-medium text-foreground">
                          <span className="block truncate" title={r.business}>{r.business}</span>
                        </td>
                        <td className="w-[18%] px-4 py-3 tabular-nums text-foreground">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Smartphone className="h-3.5 w-3.5 shrink-0 text-primary" />
                            {r.phone}
                          </span>
                        </td>
                        <td className="w-[22%] px-4 py-3 text-muted-foreground">
                          <span className="block truncate" title={r.email}>{r.email}</span>
                        </td>
                        <td className="w-[15%] px-4 py-3 text-muted-foreground">
                          <span className="block truncate" title={r.website}>{domain}</span>
                        </td>
                        <td className="w-[10%] px-4 py-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-default items-center gap-1.5 whitespace-nowrap">
                                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 p-1.5">
                                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                                </span>
                                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 p-1.5">
                                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Mobile verified · DNC scrubbed · Litigator checked</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="w-[15%] px-4 py-3 text-muted-foreground">{r.city}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TooltipProvider>
          </div>
        </div>
      </section>

      {/* Ready to reach out? */}
      {/* Choose your starting point */}
      <section className="border-t border-border bg-surface-muted py-14">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
              Start With Your Data. Or Ours.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
              Two ways in — both end with an outreach-ready list.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Upload card */}
            <div className="flex flex-col rounded-3xl border border-border bg-background p-6 transition-colors hover:border-primary md:p-8">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-black text-foreground">Upload & Clean</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Upload a CSV, CRM export, or existing lead list. We'll clean, enrich, verify, and prepare
                it for outreach.
              </p>
              <p className="mt-3 text-xs font-semibold text-foreground">
                Supports CSV, XLSX, And CRM Exports — Thousands Of Records In Minutes.
              </p>

              <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  How It Works
                </div>
                <MiniWorkflow
                  steps={[
                    { icon: <FileSpreadsheet className="h-6 w-6" />, label: "CSV" },
                    { icon: <Settings className="h-6 w-6" />, label: "LeadTrace" },
                    { icon: <CircleCheck className="h-6 w-6" />, label: "Clean List" },
                  ]}
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold text-foreground">
                <span>Deduplicate</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Verify</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Skip Trace (Optional)</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Compliance Check</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-primary">Ready For Outreach</span>
              </div>

              <Button asChild size="lg" variant="outline" className="mt-8 w-full rounded-full">
                <Link to="/auth">
                  Upload CSV <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Generate card */}
            <div className="relative flex flex-col rounded-3xl border-2 border-primary bg-background p-6 shadow-lg md:p-8">
              <div className="flex items-center justify-between gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Globe className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                  Most Popular
                </span>
              </div>
              <h3 className="mt-5 font-display text-xl font-black text-foreground">Generate & Launch</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Find businesses, prepare every contact automatically, then launch compliant SMS campaigns.
              </p>
              <p className="mt-3 text-xs font-semibold text-foreground">
                Search Millions Of Businesses Across Multiple Data Sources — Nationwide.
              </p>

              <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  How It Works
                </div>
                <MiniWorkflow
                  steps={[
                    { icon: <Search className="h-6 w-6" />, label: "Business Search" },
                    { icon: <Settings className="h-6 w-6" />, label: "LeadTrace" },
                    { icon: <MessageCircle className="h-6 w-6" />, label: "SMS Campaign" },
                  ]}
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold text-foreground">
                <span>Find Businesses</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Clean & Verify</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Launch Outreach</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-primary">Start Conversations</span>
              </div>

              <Button asChild size="lg" className="mt-8 w-full rounded-full">
                <Link to="/auth">
                  Build My List <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Find Your Next Customers — three tiers: LeadTrace feeds, templates, sources */}
      <section className="border-y border-border bg-surface py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-black text-foreground">
                Find Your Next Customers
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
                {NICHE_CATEGORIES.map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-primary">
                      {c}
                    </span>
                    {i < NICHE_CATEGORIES.length - 1 && <span className="text-border">•</span>}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Every List:</span>
              {NICHE_FACTS.map((f) => (
                <span key={f.label} className="inline-flex items-center gap-1.5">
                  <f.icon className="h-4 w-4 shrink-0 text-primary" /> {f.label}
                </span>
              ))}
            </div>
          </div>

          {/* Level 1 — LeadTrace proprietary feeds */}
          <div className="mt-12">
            <div className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-primary">
              Featured Lead Feeds
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              {FEATURED_FEEDS.map((f) => (
                <Link
                  key={f.to}
                  to={f.to}
                  className="group relative flex flex-col rounded-3xl border border-border bg-gradient-to-b from-primary/[0.06] to-transparent p-7 shadow-sm transition-all hover:border-primary hover:shadow-md"
                >
                  {f.isNew && (
                    <span className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.12em] text-primary-foreground">
                      New
                    </span>
                  )}
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <span className="mt-6 font-display text-xl font-black text-foreground">{f.title}</span>
                  <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</span>
                  {f.recordTypes && (
                    <span className="mt-5 flex flex-wrap gap-1.5">
                      {f.recordTypes.map((r) => (
                        <span
                          key={r}
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-[0.625rem] font-semibold text-muted-foreground"
                        >
                          {r}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="mt-7 inline-flex items-center gap-1 text-sm font-bold text-primary">
                    {f.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Level 2 — individual LeadTrace lead feeds */}
          <div className="mt-16">
            <div className="flex items-end justify-between gap-4">
              <div className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Popular Templates
              </div>
              <Link
                to="/templates"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
              >
                View All Templates <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {POPULAR_TEMPLATES.map((n) => {
                const page = niches.find((p) => p.slug === n.slug);
                const Icon = n.icon;
                const label = n.display ?? page?.nicheLabel ?? page?.title ?? n.slug;
                return (
                  <Link
                    key={n.slug}
                    to="/leads/$slug"
                    params={{ slug: n.slug }}
                    className="group flex items-center gap-4 rounded-2xl border border-border bg-background p-5 transition-colors hover:border-primary"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-black text-foreground">
                        {label}
                      </span>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        View Leads <ArrowRight className="h-3 w-3" />
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Also Popular:</span>
              {BUSINESS_NICHES.map((n) => (
                <Link
                  key={n.slug}
                  to="/leads/$slug"
                  params={{ slug: n.slug }}
                  className="rounded-full border border-border bg-background px-3 py-1 font-medium transition-colors hover:border-primary hover:text-foreground"
                >
                  {n.display}
                </Link>
              ))}
            </div>
          </div>

          {/* Level 3 — external data sources available inside the product */}
          <div className="mt-16 rounded-3xl border border-border bg-background p-7">
            <div className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Data Sources
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              External sources LeadTrace pulls from — every record still runs the same pipeline.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DATA_SOURCES.map((s) => {
                const t = getTemplate(s.id);
                if (!t) return null;
                return (
                  <Link
                    key={s.id}
                    to="/templates/$templateId"
                    params={{ templateId: s.id }}
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-primary"
                  >
                    <TemplateLogo template={t} className="h-9 w-9" imgClassName="h-5 w-5" iconClassName="h-4 w-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{s.label}</span>
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">{s.sub}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits (formerly pipeline stages) */}
      <section className="bg-background py-14">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            Why Our Lists Convert Better
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {BENEFIT_ORDER.map((slug) => {
              const isAi = slug === "ai-built";
              const p = stages.find((s) => s.slug === slug);
              const b = BENEFITS[slug];
              const Icon = BENEFIT_ICONS[slug];
              const title = b?.title ?? p?.title ?? "";
              const body = b?.body ?? p?.valueProp ?? "";
              return (
                <Link
                  key={slug}
                  to={isAi ? "/app/assistant" : "/leads/$slug"}
                  params={isAi ? undefined : { slug }}
                  className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
                >
                  <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-display text-lg font-black text-foreground">
                    {title}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Three pillars: source → processing → result */}
      <section className="border-t border-border bg-surface-muted py-14">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-center text-2xl md:text-3xl font-black text-foreground">
            One Pipeline. From Source To Send.
          </h2>
          <div className="mt-10 grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4">
            <PillarCard
              icon={<Database className="h-5 w-5" />}
              title="Built From"
              footLabel="+12 Sources"
              items={[
                { icon: <Landmark className="h-4 w-4" />, label: "Public Records" },
                { icon: <Building2 className="h-4 w-4" />, label: "Business Directories" },
                { icon: <Smartphone className="h-4 w-4" />, label: "Carrier Data" },
                { icon: <Upload className="h-4 w-4" />, label: "Customer Uploads" },
              ]}
            />
            <PillarArrow />
            <PillarCard
              highlight
              icon={<Settings className="h-5 w-5" />}
              title="Processed By"
              footLabel="Automatic On Every List"
              items={[
                { icon: <Check className="h-4 w-4" />, label: "Deduplication" },
                { icon: <Check className="h-4 w-4" />, label: "Mobile Verification" },
                { icon: <Check className="h-4 w-4" />, label: "Optional Skip Trace" },
                { icon: <Check className="h-4 w-4" />, label: "DNC Compliance" },
              ]}
            />
            <PillarArrow />
            <PillarCard
              icon={<CircleCheck className="h-5 w-5" />}
              title="Delivered As"
              footLabel="554 Records Ready"
              items={[
                { icon: <Smartphone className="h-4 w-4" />, label: "Mobile Verified" },
                { icon: <FileSpreadsheet className="h-4 w-4" />, label: "Export Ready" },
                { icon: <Star className="h-4 w-4" />, label: "Never Resold" },
                { icon: <Send className="h-4 w-4" />, label: "SMS Campaign Ready" },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Final conversion */}
      <section className="border-t border-border bg-background py-14">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground">
            Ready To Build Your First List?
          </h2>
          <p className="mx-auto mt-3 max-w-none whitespace-nowrap text-sm text-muted-foreground">
            Generate a new list, upload your own data, or launch outreach — all from one platform.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/auth">
                Build My List <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="." hash="sample-list">
                See Sample Export
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
