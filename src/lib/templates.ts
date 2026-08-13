import {
  Building2, Search, MapPin, Scale, Hammer, FileWarning, Landmark, Home, Upload,
  Briefcase, ShoppingCart, Star, Users, Globe, Newspaper, Megaphone, GraduationCap,
  Car, Utensils, Stethoscope, Wrench, Camera, Music, Plane, Store,
  Mail, Rocket, BadgeCheck, Network,
  DollarSign, BookOpen, Trophy, Film, Code, MessageSquare, Hotel, Bed,
  ScanEye, CircleDollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TemplateCategory =
  | "business"
  | "directories"
  | "records"
  | "social"
  | "ecommerce"
  | "jobs"
  | "reviews"
  | "realestate"
  | "travel"
  | "finance"
  | "education"
  | "news"
  | "sports"
  | "search"
  | "upload";

export type Template = {
  id: string;
  title: string;
  subtitle: string;
  /**
   * Every category this source legitimately belongs to. County-records sources
   * are both Public Records and Real Estate, so a Real Estate filter finds them.
   * The first entry is the primary category used for labels and related lists.
   */
  categories: TemplateCategory[];
  prompt: string;
  icon: LucideIcon;
  tint: string;
  /** Marks the template as Beta in the UI. */
  beta?: boolean;
  /** Shown in the assistant's starter grid. Lower `featuredOrder` sorts first. */
  featured?: boolean;
  featuredOrder?: number;
  /**
   * Overrides for the List Builder. `adapterStatus` says whether the pipeline
   * can actually run this source today; `fieldSchema` names the builder fields
   * it needs (defaults come from the category — see lib/template-schema.ts).
   */
  adapterStatus?: "live" | "beta" | "requested";
  fieldSchema?: string[];
  /** Two-line scannable label used in compact grids (title / subtitle). */
  shortTitle?: string;
  shortSubtitle?: string;
  /** Domain used to fetch the real company logo (favicon). */
  logoDomain?: string;
  /**
   * Composer placeholder shown while this template is selected — a fill-in
   * example for the slots the operator still has to supply.
   */
  placeholderHint?: string;
  /**
   * Credits this source draws per lead returned. 0 means genuinely zero
   * marginal cost to us (own-data uploads, single-site crawls) and renders the
   * "Free" badge. Left undefined, `creditCostPerLead` falls back to the metered
   * default — we never promise free unless it's explicitly set here.
   */
  credit_cost_per_lead?: number;
};

/** Metered default for any source that hits a paid provider per record. */
export const DEFAULT_CREDIT_COST_PER_LEAD = 1;

/** Primary category — labels, related lists, and field schemas key off this. */
export function primaryCategory(t: Template): TemplateCategory {
  return t.categories[0] ?? "business";
}

/** Does this template belong to `category` at all (not just primarily)? */
export function hasCategory(t: Template, category: TemplateCategory): boolean {
  return t.categories.includes(category);
}

/** Single source of truth for what a template draws from the plan's credits. */
export function creditCostPerLead(t: Template): number {
  return t.credit_cost_per_lead ?? DEFAULT_CREDIT_COST_PER_LEAD;
}

/** Badge copy for a template's credit draw. `free` drives the green treatment. */
export function templateCostBadge(t: Template): { free: boolean; label: string } {
  const cost = creditCostPerLead(t);
  if (cost <= 0) return { free: true, label: "Free" };
  const amount = Number.isInteger(cost) ? String(cost) : cost.toFixed(2);
  return { free: false, label: `${amount} credit${cost === 1 ? "" : "s"} / lead` };
}

export const TEMPLATES: Template[] = [
  // ---------- Upload (pinned first) ----------
  {
    id: "upload",
    featured: true,
    featuredOrder: 6,
    title: "Upload My List",
    subtitle: "Drop A CSV, Skip Trace And Scrub It.",
    categories: ["upload"],
    prompt: "Upload my CSV list, map the columns, skip trace missing numbers, and scrub it",
    icon: Upload,
    tint: "bg-yellow-500/10 text-yellow-700",
    placeholderHint: "e.g. Skip trace my CSV and scrub it against DNC — mobile numbers only",
    credit_cost_per_lead: 0,
  },

  // ---------- Business & Local ----------
  {
    id: "street-scan",
    featured: true,
    featuredOrder: 2,
    shortTitle: "Street Scan",
    shortSubtitle: "AI Driving For Dollars",
    title: "Street Scan",
    subtitle: "AI Driving For Dollars",
    categories: ["realestate"],
    prompt: "Scan Hillsborough County, FL for rundown single-family homes with roof damage, overgrown yards, or signs of vacancy",
    icon: ScanEye,
    tint: "bg-primary/10 text-primary",
    adapterStatus: "live",
    placeholderHint: "e.g. Tarped roofs in ZIP 33610 — absentee owners, 7+ years owned",
    credit_cost_per_lead: 2,
  },
  {
    id: "gmaps",
    featured: true,
    featuredOrder: 3,
    shortTitle: "Google Maps",
    shortSubtitle: "Business Listings",
    title: "Google Maps Businesses",
    subtitle: "Businesses By Trade + Location. Optional Franchise Filter.",
    categories: ["business"],
    prompt: "Scrape all HVAC and plumbing businesses on Google Maps across every county in Florida, remove franchises",
    icon: MapPin,
    tint: "bg-primary/10 text-primary",
    logoDomain: "google.com/maps",
    placeholderHint: "e.g. Roofers in Hillsborough County, FL — mobile numbers only",
    credit_cost_per_lead: 1,
  },
  {
    id: "gserp",
    featured: true,
    featuredOrder: 17,
    shortTitle: "Google Search",
    shortSubtitle: "Sites + Emails",
    title: "Google Search Scraper",
    subtitle: "Websites, Emails, And Socials From Google Results By Keyword.",
    categories: ["business"],
    prompt: "Scrape websites, emails, and social profiles from Google search results for a keyword and location",
    icon: Search,
    tint: "bg-blue-500/10 text-blue-600",
    logoDomain: "google.com",
    placeholderHint: "e.g. Water damage restoration in Tampa, FL — emails and phones",
    credit_cost_per_lead: 1,
  },
  {
    id: "glocal",
    shortTitle: "Google Local",
    shortSubtitle: "Service Providers",
    title: "Google Local Services",
    subtitle: "Local Service Providers With Name, Phone, Website, And Address.",
    categories: ["business"],
    prompt: "Scrape local service providers from Google Local Services by keyword and location",
    icon: BadgeCheck,
    tint: "bg-emerald-500/10 text-emerald-600",
    logoDomain: "google.com",
    placeholderHint: "e.g. Plumbers in Pinellas County, FL with phone numbers",
    credit_cost_per_lead: 1,
  },
  {
    id: "contact-details",
    featured: true,
    featuredOrder: 4,
    shortTitle: "Contact Details",
    shortSubtitle: "Any Website",
    title: "Contact Details Scraper (Any Site)",
    subtitle: "Pull Emails, Phones, And Social Profiles From Any Webpage.",
    categories: ["business"],
    prompt: "Extract emails, phone numbers, and social media profiles from these websites",
    icon: Mail,
    tint: "bg-primary/10 text-primary",
    placeholderHint: "e.g. Pull contacts from these 40 roofing company websites",
    credit_cost_per_lead: 0,
  },
  {
    id: "universal-crawl",
    shortTitle: "Site Crawler",
    shortSubtitle: "Every Subpage",
    title: "Universal Site + Subpage Scraper",
    subtitle: "Crawl A Site And Its Subpages For All Contact Details.",
    categories: ["business"],
    prompt: "Crawl this website and its subpages and extract all contact details",
    icon: Network,
    tint: "bg-indigo-500/10 text-indigo-600",
    placeholderHint: "e.g. Crawl acmeroofing.com and every subpage for contacts",
    credit_cost_per_lead: 0,
  },
  {
    id: "yelp",
    featured: true,
    featuredOrder: 12,
    shortTitle: "Yelp",
    shortSubtitle: "Local Businesses",
    title: "Yelp Businesses",
    subtitle: "Local Businesses With Reviews + Contact Info.",
    categories: ["directories"],
    prompt: "Scrape all Yelp restaurants in Chicago with 4+ stars and export owner contacts",
    icon: Utensils,
    tint: "bg-rose-500/10 text-rose-600",
    logoDomain: "yelp.com",
    beta: true,
    placeholderHint: "e.g. Restaurants in Chicago, IL with 4+ stars",
    credit_cost_per_lead: 1,
  },
  {
    id: "yellowpages",
    featured: true,
    featuredOrder: 18,
    title: "Yellow Pages",
    subtitle: "Business Name, Address, Phone, Website, And Email By Keyword.",
    categories: ["directories"],
    prompt: "Scrape business name, address, phone, website, and email from Yellow Pages by keyword and location",
    icon: Wrench,
    tint: "bg-yellow-500/10 text-yellow-700",
    logoDomain: "yellowpages.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "superpages",
    title: "Superpages",
    subtitle: "Business Contacts And Socials By Keyword And Zip Code.",
    categories: ["directories"],
    prompt: "Scrape business name, address, phone, website, and social links from Superpages by keyword and zip code",
    icon: Building2,
    tint: "bg-orange-500/10 text-orange-700",
    beta: true,
    credit_cost_per_lead: 1,
  },
  {
    id: "bbb",
    title: "Better Business Bureau",
    subtitle: "Accredited Businesses By Industry + State.",
    categories: ["directories"],
    prompt: "Pull BBB-accredited HVAC businesses in Georgia with A+ rating",
    icon: Building2,
    tint: "bg-blue-500/10 text-blue-700",
    logoDomain: "bbb.org",
    credit_cost_per_lead: 1,
  },
  {
    id: "tripadvisor",
    title: "TripAdvisor Listings",
    subtitle: "Hotels, Restaurants + Attractions.",
    categories: ["directories"],
    prompt: "Scrape TripAdvisor hotels in Miami with owner contact details",
    icon: Plane,
    tint: "bg-emerald-500/10 text-emerald-600",
    logoDomain: "tripadvisor.com",
    credit_cost_per_lead: 1,
  },

  // ---------- Social & Creators ----------
  {
    id: "linkedin",
    featured: true,
    featuredOrder: 11,
    title: "LinkedIn Company / People",
    subtitle: "Company And Decision-Maker Profiles By Industry.",
    categories: ["directories"],
    prompt: "Find companies and decision-makers on LinkedIn by industry and location",
    icon: Users,
    tint: "bg-sky-500/10 text-sky-700",
    logoDomain: "linkedin.com",
    beta: true,
    credit_cost_per_lead: 1,
  },
  {
    id: "instagram",
    featured: true,
    featuredOrder: 13,
    title: "Instagram Creators",
    subtitle: "Influencers By Niche + Follower Range.",
    categories: ["social"],
    prompt: "Scrape Instagram fitness creators with 10k–100k followers in the US",
    icon: Camera,
    tint: "bg-pink-500/10 text-pink-600",
    logoDomain: "instagram.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "tiktok",
    title: "TikTok Creators",
    subtitle: "Creators By Hashtag + Engagement.",
    categories: ["social"],
    prompt: "Find TikTok creators posting about home renovation with 25k+ followers",
    icon: Music,
    tint: "bg-slate-800/10 text-slate-900",
    logoDomain: "tiktok.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "youtube",
    title: "YouTube Channels",
    subtitle: "Channels By Topic + Subscriber Count.",
    categories: ["social"],
    prompt: "Scrape YouTube real-estate channels with 5k+ subs and public emails",
    icon: Megaphone,
    tint: "bg-red-500/10 text-red-600",
    logoDomain: "youtube.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "twitter",
    title: "X (Twitter) Profiles",
    subtitle: "Profiles By Keyword + Bio Match.",
    categories: ["social"],
    prompt: "Find X profiles with 'founder' in bio in fintech with 1k+ followers",
    icon: Globe,
    tint: "bg-slate-800/10 text-slate-900",
    logoDomain: "x.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "facebook",
    title: "Facebook Pages",
    subtitle: "Business Pages With Contact Info And Category.",
    categories: ["directories"],
    prompt: "Scrape business pages on Facebook by category and location for contact info",
    icon: Users,
    tint: "bg-blue-500/10 text-blue-600",
    logoDomain: "facebook.com",
    beta: true,
    credit_cost_per_lead: 1,
  },

  // ---------- E-commerce ----------
  {
    id: "amazon",
    title: "Amazon Sellers",
    subtitle: "3rd-Party Sellers By Category + Brand.",
    categories: ["ecommerce"],
    prompt: "Scrape Amazon sellers in home & kitchen with 1k+ reviews",
    icon: ShoppingCart,
    tint: "bg-orange-500/10 text-orange-600",
    logoDomain: "amazon.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "shopify",
    featured: true,
    featuredOrder: 15,
    title: "Shopify Stores",
    subtitle: "DTC Brands By Niche + Traffic.",
    categories: ["ecommerce"],
    prompt: "Find Shopify skincare brands with 50k+ monthly visits and contact info",
    icon: Store,
    tint: "bg-emerald-500/10 text-emerald-600",
    logoDomain: "shopify.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "ebay",
    title: "eBay Sellers",
    subtitle: "Top-Rated Sellers By Category.",
    categories: ["ecommerce"],
    prompt: "Scrape top-rated eBay sellers of collectible sneakers in the US",
    icon: ShoppingCart,
    tint: "bg-blue-500/10 text-blue-600",
    logoDomain: "ebay.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "etsy",
    title: "Etsy Shops",
    subtitle: "Handmade Sellers By Category + Sales.",
    categories: ["ecommerce"],
    prompt: "Find Etsy shops in home decor with 1k+ sales and owner contacts",
    icon: Store,
    tint: "bg-orange-500/10 text-orange-700",
    logoDomain: "etsy.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "walmart",
    title: "Walmart Marketplace",
    subtitle: "Marketplace Sellers By Vertical.",
    categories: ["ecommerce"],
    prompt: "Pull Walmart marketplace sellers in kitchen appliances with contact details",
    icon: ShoppingCart,
    tint: "bg-blue-500/10 text-blue-700",
    logoDomain: "walmart.com",
    credit_cost_per_lead: 1,
  },

  // ---------- Jobs & Hiring ----------
  {
    id: "indeed",
    featured: true,
    featuredOrder: 14,
    title: "Indeed Job Postings",
    subtitle: "Companies Hiring By Role + Region.",
    categories: ["jobs"],
    prompt: "Find companies on Indeed hiring senior engineers in Austin this month",
    icon: Briefcase,
    tint: "bg-indigo-500/10 text-indigo-600",
    logoDomain: "indeed.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "googlejobs",
    title: "Google Jobs Scraper",
    subtitle: "Employers Hiring, With Company, Emails, And Apply Links.",
    categories: ["jobs"],
    prompt: "Scrape employers hiring on Google Jobs by keyword and location for company and contact details",
    icon: Briefcase,
    tint: "bg-blue-500/10 text-blue-600",
    logoDomain: "google.com",
    beta: true,
    credit_cost_per_lead: 1,
  },
  {
    id: "glassdoor",
    title: "Glassdoor Companies",
    subtitle: "Growing Companies By Size + Rating.",
    categories: ["jobs"],
    prompt: "Pull Glassdoor companies rated 4+ with 100–500 employees in healthcare",
    icon: Briefcase,
    tint: "bg-emerald-500/10 text-emerald-700",
    logoDomain: "glassdoor.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "ziprecruiter",
    title: "ZipRecruiter Jobs",
    subtitle: "Employers Actively Hiring Now.",
    categories: ["jobs"],
    prompt: "Scrape ZipRecruiter employers hiring HVAC techs in Florida",
    icon: Briefcase,
    tint: "bg-emerald-500/10 text-emerald-600",
    logoDomain: "ziprecruiter.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "crunchbase",
    title: "Crunchbase Companies",
    subtitle: "Funded Companies With Site, Industry, And Location.",
    categories: ["directories"],
    prompt: "Find funded companies on Crunchbase by industry and location",
    icon: Rocket,
    tint: "bg-blue-500/10 text-blue-700",
    logoDomain: "crunchbase.com",
    beta: true,
    credit_cost_per_lead: 1,
  },

  // ---------- Reviews ----------
  {
    id: "trustpilot",
    title: "Trustpilot Businesses",
    subtitle: "Brands By Rating + Review Volume.",
    categories: ["reviews"],
    prompt: "Find Trustpilot brands with 3-star ratings in insurance and pull contacts",
    icon: Star,
    tint: "bg-emerald-500/10 text-emerald-600",
    logoDomain: "trustpilot.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "g2",
    title: "G2 SaaS Vendors",
    subtitle: "SaaS Companies By Category + Reviews.",
    categories: ["reviews"],
    prompt: "Pull G2-listed CRM vendors with 100+ reviews and public contact pages",
    icon: Star,
    tint: "bg-red-500/10 text-red-600",
    logoDomain: "g2.com",
    credit_cost_per_lead: 1,
  },

  // ---------- Real Estate ----------
  {
    id: "zillow",
    featured: true,
    featuredOrder: 5,
    title: "Zillow FSBOs",
    subtitle: "For-Sale-By-Owner Listings + Owners.",
    categories: ["realestate"],
    prompt: "Scrape Zillow FSBO listings in Tampa with owner phone lookups",
    icon: Home,
    tint: "bg-blue-500/10 text-blue-600",
    logoDomain: "zillow.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "redfin",
    title: "Redfin Listings",
    subtitle: "Active + Expired Listings By Market.",
    categories: ["realestate"],
    prompt: "Pull Redfin expired listings in Phoenix over 60 days and skip trace owners",
    icon: Home,
    tint: "bg-red-500/10 text-red-600",
    logoDomain: "redfin.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "realtor",
    featured: true,
    featuredOrder: 16,
    title: "Realtor.com",
    subtitle: "Agents + Listings By ZIP.",
    categories: ["realestate"],
    prompt: "Find Realtor.com agents in the top 20 Florida ZIPs by transaction volume",
    icon: Home,
    tint: "bg-red-500/10 text-red-700",
    logoDomain: "realtor.com",
    credit_cost_per_lead: 1,
  },

  // ---------- Public Records ----------
  {
    // The maintained feed itself: we pull these counties nightly, so browsing
    // and filtering costs nothing and only pulling records into leads spends
    // credits. The record-type templates below are presets over the same feed.
    id: "distress-feed",
    featured: true,
    featuredOrder: 1,
    shortTitle: "Distress Feed",
    shortSubtitle: "Pulled Nightly",
    title: "Distress Feed",
    // Honest scope: only the record types with a verified adapter get named.
    subtitle: "Pre-Foreclosures, Tax Defaults & More",
    categories: ["records", "realestate"],
    prompt:
      "Show me new code violation and tax delinquency filings in Cook County IL from the Distress Feed",
    icon: Scale,
    tint: "bg-red-500/10 text-red-600",
    placeholderHint: "e.g. New tax delinquency filings in Philadelphia County, PA",
    credit_cost_per_lead: 0,
  },
  {
    id: "probate",
    featured: true,
    featuredOrder: 7,
    shortTitle: "Probate",
    shortSubtitle: "New Filings",
    title: "Probate Records",
    subtitle: "New Probate Filings, Heirs Auto Traced.",
    categories: ["records", "realestate"],
    prompt: "Pull all new probate filings in Hillsborough County FL from the last 90 days and skip trace the heirs",
    icon: Scale,
    tint: "bg-amber-500/10 text-amber-600",
    placeholderHint: "e.g. Probate filings in Pasco County, FL from the last 90 days",
    credit_cost_per_lead: 0,
  },
  {
    id: "code",
    shortTitle: "Code Violations",
    shortSubtitle: "Distressed Owners",
    title: "Code Violations",
    subtitle: "Distressed Properties With Open Violations.",
    categories: ["records", "realestate"],
    prompt: "Find all code violation properties in Pinellas County FL and skip trace the owners",
    icon: FileWarning,
    tint: "bg-rose-500/10 text-rose-600",
    placeholderHint: "e.g. Code violations in Pinellas County, FL from the last 60 days",
    credit_cost_per_lead: 0,
  },
  {
    // Surplus funds are one record type inside the Distress Feed; this preset
    // returns overages only. The dedicated public hub lives at /surplus-funds.
    id: "surplus-funds",
    featured: true,
    featuredOrder: 10,
    shortTitle: "Surplus Funds",
    shortSubtitle: "Auction Overages",
    title: "Surplus Funds",
    subtitle: "Auction Overages & Unclaimed Proceeds.",
    categories: ["records", "realestate"],
    prompt:
      "Show me surplus funds and excess proceeds from tax deed and foreclosure sales in Hillsborough County FL",
    icon: CircleDollarSign,
    tint: "bg-emerald-500/10 text-emerald-700",
    placeholderHint: "e.g. Surplus funds over $10,000 in Hillsborough County, FL",
    credit_cost_per_lead: 0,
  },
  {
    id: "prefc",
    featured: true,
    featuredOrder: 9,
    title: "Pre-Foreclosures",
    subtitle: "Lis Pendens + Notice Of Default Filings.",
    categories: ["records", "realestate"],
    prompt: "Get pre-foreclosure and lis pendens filings in Pasco County FL from the last 30 days",
    icon: Hammer,
    tint: "bg-orange-500/10 text-orange-600",
    placeholderHint: "e.g. Pre-foreclosures in Pasco County, FL from the last 30 days",
    credit_cost_per_lead: 0,
  },
  {
    id: "tax",
    featured: true,
    featuredOrder: 8,
    title: "Tax Defaults",
    subtitle: "Tax Delinquent Property Owners.",
    categories: ["records", "realestate"],
    prompt: "Pull tax delinquent property owners in Polk County FL",
    icon: Landmark,
    tint: "bg-indigo-500/10 text-indigo-600",
    beta: true,
    credit_cost_per_lead: 0,
  },
  {
    id: "vacancy",
    shortTitle: "Vacant Homes",
    shortSubtitle: "Vacancy + Demo",
    title: "Vacancy / Demolition",
    subtitle: "Uninhabitable + Demolition-Notice Homes.",
    categories: ["records", "realestate"],
    prompt: "Find vacancy and demolition notices in Hernando County FL and skip trace owners",
    icon: Home,
    tint: "bg-slate-500/10 text-slate-600",
    beta: true,
    credit_cost_per_lead: 0,
  },

  // ---------- E-Commerce (expanded) ----------
  { id: "amazon-products", title: "Amazon Products", subtitle: "Titles, Prices, Ratings, Reviews, ASINs, And Images.", categories: ["ecommerce"], prompt: "Scrape Amazon products by keyword with price, ratings, and reviews", icon: ShoppingCart, tint: "bg-orange-500/10 text-orange-600", logoDomain: "amazon.com", credit_cost_per_lead: 1 },
  { id: "aliexpress", title: "AliExpress Products", subtitle: "Product Listings + Seller Info By Category.", categories: ["ecommerce"], prompt: "Scrape AliExpress products in electronics with seller info", icon: ShoppingCart, tint: "bg-red-500/10 text-red-600", logoDomain: "aliexpress.com", credit_cost_per_lead: 1 },
  { id: "alibaba", title: "Alibaba Suppliers", subtitle: "Wholesale Suppliers By Product + Country.", categories: ["ecommerce"], prompt: "Find Alibaba suppliers for kitchen appliances in China", icon: Store, tint: "bg-orange-500/10 text-orange-700", logoDomain: "alibaba.com", credit_cost_per_lead: 1 },
  { id: "target", title: "Target Products", subtitle: "Product Listings, Prices, And Availability.", categories: ["ecommerce"], prompt: "Scrape Target products by category with pricing", icon: ShoppingCart, tint: "bg-red-500/10 text-red-600", logoDomain: "target.com", credit_cost_per_lead: 1 },
  { id: "bestbuy", title: "Best Buy Products", subtitle: "Electronics With Prices, Specs, And Ratings.", categories: ["ecommerce"], prompt: "Scrape Best Buy laptops with prices and specifications", icon: ShoppingCart, tint: "bg-blue-500/10 text-blue-700", logoDomain: "bestbuy.com", credit_cost_per_lead: 1 },
  { id: "homedepot", title: "Home Depot Products", subtitle: "Building Products By Category + Store.", categories: ["ecommerce"], prompt: "Scrape Home Depot products in flooring with prices", icon: Wrench, tint: "bg-orange-500/10 text-orange-700", logoDomain: "homedepot.com", credit_cost_per_lead: 1 },
  { id: "wayfair", title: "Wayfair Furniture", subtitle: "Home Furniture Listings + Prices.", categories: ["ecommerce"], prompt: "Scrape Wayfair sofas with prices and dimensions", icon: Home, tint: "bg-emerald-500/10 text-emerald-700", logoDomain: "wayfair.com", credit_cost_per_lead: 1 },
  { id: "newegg", title: "Newegg Products", subtitle: "Tech Products With Prices + Ratings.", categories: ["ecommerce"], prompt: "Scrape Newegg GPUs by model with prices and reviews", icon: ShoppingCart, tint: "bg-orange-500/10 text-orange-600", logoDomain: "newegg.com", credit_cost_per_lead: 1 },
  { id: "costco", title: "Costco Products", subtitle: "Warehouse Deals + Bulk Pricing.", categories: ["ecommerce"], prompt: "Scrape Costco electronics with member pricing", icon: Store, tint: "bg-red-500/10 text-red-700", logoDomain: "costco.com", credit_cost_per_lead: 1 },
  { id: "shein", title: "SHEIN Products", subtitle: "Fashion Listings By Category.", categories: ["ecommerce"], prompt: "Scrape SHEIN womenswear with prices and images", icon: ShoppingCart, tint: "bg-slate-800/10 text-slate-900", logoDomain: "shein.com", credit_cost_per_lead: 1 },
  { id: "temu", title: "Temu Products", subtitle: "Marketplace Listings + Seller Data.", categories: ["ecommerce"], prompt: "Scrape Temu products in home goods with prices", icon: ShoppingCart, tint: "bg-orange-500/10 text-orange-600", logoDomain: "temu.com", credit_cost_per_lead: 1 },
  { id: "mercadolibre", title: "Mercado Libre", subtitle: "Latin America Marketplace Listings.", categories: ["ecommerce"], prompt: "Scrape Mercado Libre listings in Mexico by category", icon: ShoppingCart, tint: "bg-yellow-500/10 text-yellow-700", logoDomain: "mercadolibre.com", credit_cost_per_lead: 1 },
  { id: "flipkart", title: "Flipkart Products", subtitle: "India Marketplace Listings.", categories: ["ecommerce"], prompt: "Scrape Flipkart smartphones with prices and specs", icon: ShoppingCart, tint: "bg-blue-500/10 text-blue-600", logoDomain: "flipkart.com", credit_cost_per_lead: 1 },

  // ---------- Social Media (expanded) ----------
  { id: "reddit", title: "Reddit Posts", subtitle: "Threads, Comments, And Users By Subreddit.", categories: ["social"], prompt: "Scrape r/realestate posts from the last 30 days with comments", icon: MessageSquare, tint: "bg-orange-500/10 text-orange-600", logoDomain: "reddit.com", credit_cost_per_lead: 1 },
  { id: "pinterest", title: "Pinterest Pins", subtitle: "Pins, Boards, And Creators By Keyword.", categories: ["social"], prompt: "Scrape Pinterest pins for home decor with saves and creators", icon: Camera, tint: "bg-red-500/10 text-red-600", logoDomain: "pinterest.com", credit_cost_per_lead: 1 },
  { id: "quora", title: "Quora Answers", subtitle: "Questions, Answers, And Authors By Topic.", categories: ["social"], prompt: "Scrape Quora answers in real estate investing", icon: MessageSquare, tint: "bg-red-500/10 text-red-700", logoDomain: "quora.com", credit_cost_per_lead: 1 },
  { id: "threads", title: "Threads Posts", subtitle: "Posts And Authors By Keyword.", categories: ["social"], prompt: "Scrape Threads posts about SaaS founders", icon: MessageSquare, tint: "bg-slate-800/10 text-slate-900", logoDomain: "threads.net", credit_cost_per_lead: 1 },
  { id: "tiktok-hashtag", title: "TikTok By Hashtag", subtitle: "Videos, Creators, Views, And Engagement.", categories: ["social"], prompt: "Scrape TikTok videos under #realestate with engagement metrics", icon: Music, tint: "bg-slate-800/10 text-slate-900", logoDomain: "tiktok.com", credit_cost_per_lead: 1 },
  { id: "instagram-hashtag", title: "Instagram Hashtag", subtitle: "Posts, Creators, And Contact Info By Hashtag.", categories: ["social"], prompt: "Scrape Instagram posts under #fitnesscoach with creator emails", icon: Camera, tint: "bg-pink-500/10 text-pink-600", logoDomain: "instagram.com", credit_cost_per_lead: 1 },
  { id: "youtube-search", title: "YouTube Search", subtitle: "Videos, Channels, And Metadata By Keyword.", categories: ["social"], prompt: "Scrape YouTube videos about home renovation with channel info", icon: Film, tint: "bg-red-500/10 text-red-600", logoDomain: "youtube.com", credit_cost_per_lead: 1 },

  // ---------- Real Estate (expanded) ----------
  { id: "trulia", title: "Trulia Listings", subtitle: "For-Sale Listings + Local Insights.", categories: ["realestate"], prompt: "Scrape Trulia listings in Denver with agent contacts", icon: Home, tint: "bg-emerald-500/10 text-emerald-600", logoDomain: "trulia.com", credit_cost_per_lead: 1 },
  { id: "apartments", title: "Apartments.com", subtitle: "Rentals By City + Amenities.", categories: ["realestate"], prompt: "Scrape Apartments.com rentals in Miami with pricing and amenities", icon: Home, tint: "bg-blue-500/10 text-blue-700", logoDomain: "apartments.com", credit_cost_per_lead: 1 },
  { id: "loopnet", title: "LoopNet CRE", subtitle: "Commercial Listings + Broker Info.", categories: ["realestate"], prompt: "Scrape LoopNet retail properties in Texas with broker contacts", icon: Building2, tint: "bg-slate-500/10 text-slate-700", logoDomain: "loopnet.com", credit_cost_per_lead: 1 },
  { id: "rightmove", title: "Rightmove (UK)", subtitle: "UK Property Listings + Agents.", categories: ["realestate"], prompt: "Scrape Rightmove listings in London with agent contacts", icon: Home, tint: "bg-emerald-500/10 text-emerald-700", logoDomain: "rightmove.co.uk", credit_cost_per_lead: 1 },
  { id: "zoopla", title: "Zoopla (UK)", subtitle: "UK Property Sales + Rentals.", categories: ["realestate"], prompt: "Scrape Zoopla rentals in Manchester with landlord info", icon: Home, tint: "bg-indigo-500/10 text-indigo-600", logoDomain: "zoopla.co.uk", credit_cost_per_lead: 1 },
  { id: "idealista", title: "Idealista (EU)", subtitle: "Spanish + Italian Property Portals.", categories: ["realestate"], prompt: "Scrape Idealista listings in Madrid with agent details", icon: Home, tint: "bg-emerald-500/10 text-emerald-600", logoDomain: "idealista.com", credit_cost_per_lead: 1 },

  // ---------- Jobs (expanded) ----------
  { id: "linkedin-jobs", title: "LinkedIn Jobs", subtitle: "Job Posts By Role, Company, And Location.", categories: ["jobs"], prompt: "Scrape LinkedIn jobs for VP of Sales roles at SaaS companies in NYC", icon: Briefcase, tint: "bg-sky-500/10 text-sky-700", logoDomain: "linkedin.com", beta: true, credit_cost_per_lead: 1 },
  { id: "monster", title: "Monster Jobs", subtitle: "Job Listings And Hiring Companies.", categories: ["jobs"], prompt: "Scrape Monster job posts for engineering roles in Seattle", icon: Briefcase, tint: "bg-indigo-500/10 text-indigo-700", logoDomain: "monster.com", credit_cost_per_lead: 1 },
  { id: "simplyhired", title: "SimplyHired", subtitle: "Aggregated Job Listings By Region.", categories: ["jobs"], prompt: "Scrape SimplyHired warehouse jobs in Ohio", icon: Briefcase, tint: "bg-emerald-500/10 text-emerald-600", logoDomain: "simplyhired.com", credit_cost_per_lead: 1 },
  { id: "dice", title: "Dice Tech Jobs", subtitle: "Tech Job Listings + Employers.", categories: ["jobs"], prompt: "Scrape Dice.com listings for senior React developers", icon: Code, tint: "bg-red-500/10 text-red-600", logoDomain: "dice.com", credit_cost_per_lead: 1 },

  // ---------- Reviews (expanded) ----------
  { id: "capterra", title: "Capterra Software", subtitle: "SaaS Reviews + Vendor Contacts.", categories: ["reviews"], prompt: "Scrape Capterra CRM software with review counts and vendor info", icon: Star, tint: "bg-primary/10 text-primary", logoDomain: "capterra.com", credit_cost_per_lead: 1 },
  { id: "google-reviews", title: "Google Reviews", subtitle: "Reviews For Any Business On Google Maps.", categories: ["reviews"], prompt: "Scrape Google reviews for HVAC companies in Tampa", icon: Star, tint: "bg-yellow-500/10 text-yellow-700", logoDomain: "google.com", credit_cost_per_lead: 1 },
  { id: "trustradius", title: "TrustRadius", subtitle: "B2B Software Reviews By Category.", categories: ["reviews"], prompt: "Scrape TrustRadius marketing automation software with reviews", icon: Star, tint: "bg-emerald-500/10 text-emerald-700", logoDomain: "trustradius.com", credit_cost_per_lead: 1 },
  { id: "appstore", title: "App Store Reviews", subtitle: "iOS App Reviews And Ratings.", categories: ["reviews"], prompt: "Scrape App Store reviews for fintech apps in the US", icon: Star, tint: "bg-slate-500/10 text-slate-700", logoDomain: "apple.com", credit_cost_per_lead: 1 },
  { id: "playstore", title: "Play Store Reviews", subtitle: "Android App Reviews And Ratings.", categories: ["reviews"], prompt: "Scrape Google Play reviews for productivity apps", icon: Star, tint: "bg-emerald-500/10 text-emerald-600", logoDomain: "play.google.com", credit_cost_per_lead: 1 },

  // ---------- Travel ----------
  { id: "booking", title: "Booking.com Hotels", subtitle: "Hotel Listings, Prices, And Reviews.", categories: ["travel"], prompt: "Scrape Booking.com hotels in Orlando with prices and reviews", icon: Hotel, tint: "bg-blue-500/10 text-blue-700", logoDomain: "booking.com", credit_cost_per_lead: 1 },
  { id: "airbnb", title: "Airbnb Listings", subtitle: "Short-Term Rentals + Host Info.", categories: ["travel"], prompt: "Scrape Airbnb listings in Nashville with host details", icon: Bed, tint: "bg-red-500/10 text-red-600", logoDomain: "airbnb.com", credit_cost_per_lead: 1 },
  { id: "expedia", title: "Expedia Hotels", subtitle: "Hotel Listings And Availability.", categories: ["travel"], prompt: "Scrape Expedia hotels in Las Vegas with rates", icon: Hotel, tint: "bg-yellow-500/10 text-yellow-700", logoDomain: "expedia.com", credit_cost_per_lead: 1 },
  { id: "hotels", title: "Hotels.com", subtitle: "Global Hotel Inventory + Pricing.", categories: ["travel"], prompt: "Scrape Hotels.com listings in Chicago with pricing", icon: Hotel, tint: "bg-red-500/10 text-red-700", logoDomain: "hotels.com", credit_cost_per_lead: 1 },
  { id: "kayak", title: "Kayak Flights", subtitle: "Flight Deals + Aggregated Fares.", categories: ["travel"], prompt: "Scrape Kayak flights from NYC to LA next month", icon: Plane, tint: "bg-orange-500/10 text-orange-600", logoDomain: "kayak.com", credit_cost_per_lead: 1 },
  { id: "skyscanner", title: "Skyscanner Flights", subtitle: "Global Flight Search + Prices.", categories: ["travel"], prompt: "Scrape Skyscanner flights from London to Paris", icon: Plane, tint: "bg-blue-500/10 text-blue-600", logoDomain: "skyscanner.com", credit_cost_per_lead: 1 },
  { id: "agoda", title: "Agoda Hotels", subtitle: "APAC Hotel Bookings + Prices.", categories: ["travel"], prompt: "Scrape Agoda hotels in Tokyo with pricing", icon: Hotel, tint: "bg-red-500/10 text-red-600", logoDomain: "agoda.com", credit_cost_per_lead: 1 },

  // ---------- Directories (expanded) ----------
  { id: "manta", title: "Manta", subtitle: "Small Business Directory By Category + State.", categories: ["directories"], prompt: "Scrape Manta businesses in Georgia in the trades", icon: Building2, tint: "bg-blue-500/10 text-blue-600", logoDomain: "manta.com", credit_cost_per_lead: 1 },
  { id: "foursquare", title: "Foursquare", subtitle: "Local Business Data + Categories.", categories: ["directories"], prompt: "Scrape Foursquare restaurants in Austin with contact info", icon: MapPin, tint: "bg-pink-500/10 text-pink-600", logoDomain: "foursquare.com", credit_cost_per_lead: 1 },
  { id: "yelp-directory", title: "Yellowbook", subtitle: "Local Business Directory Listings.", categories: ["directories"], prompt: "Scrape Yellowbook listings for auto repair in Ohio", icon: Wrench, tint: "bg-yellow-500/10 text-yellow-700", logoDomain: "yellowbook.com", credit_cost_per_lead: 1 },
  { id: "cylex", title: "Cylex", subtitle: "European Business Directory.", categories: ["directories"], prompt: "Scrape Cylex businesses in Germany in construction", icon: Building2, tint: "bg-blue-500/10 text-blue-700", logoDomain: "cylex.de", beta: true, credit_cost_per_lead: 1 },
  { id: "hotfrog", title: "Hotfrog", subtitle: "Global SMB Directory.", categories: ["directories"], prompt: "Scrape Hotfrog listings for cleaning companies in the UK", icon: Building2, tint: "bg-emerald-500/10 text-emerald-600", logoDomain: "hotfrog.com", credit_cost_per_lead: 1 },

  // ---------- Search Engine ----------
  { id: "bing-search", title: "Bing Search", subtitle: "SERP Titles, URLs, And Snippets.", categories: ["search"], prompt: "Scrape Bing SERP results for solar installer near me across Florida metros", icon: Search, tint: "bg-blue-500/10 text-blue-700", logoDomain: "bing.com", credit_cost_per_lead: 1 },
  { id: "duckduckgo", title: "DuckDuckGo Search", subtitle: "Privacy-Focused SERP Data.", categories: ["search"], prompt: "Scrape DuckDuckGo results for privacy-focused SaaS tools", icon: Search, tint: "bg-orange-500/10 text-orange-600", logoDomain: "duckduckgo.com", credit_cost_per_lead: 1 },
  { id: "google-scholar", title: "Google Scholar", subtitle: "Academic Papers, Authors, And Citations.", categories: ["search"], prompt: "Scrape Google Scholar papers about lead generation from 2024", icon: BookOpen, tint: "bg-blue-500/10 text-blue-700", logoDomain: "scholar.google.com", credit_cost_per_lead: 1 },

  // ---------- Finance ----------
  { id: "yahoo-finance", title: "Yahoo Finance", subtitle: "Stock Prices, Fundamentals, And News.", categories: ["finance"], prompt: "Scrape Yahoo Finance top gainers with fundamentals", icon: DollarSign, tint: "bg-emerald-500/10 text-emerald-700", logoDomain: "finance.yahoo.com", credit_cost_per_lead: 1 },
  { id: "google-finance", title: "Google Finance", subtitle: "Market Data + Company Snapshots.", categories: ["finance"], prompt: "Scrape Google Finance data for S&P 500 companies", icon: DollarSign, tint: "bg-blue-500/10 text-blue-700", logoDomain: "google.com/finance", credit_cost_per_lead: 1 },
  { id: "sec-edgar", title: "SEC EDGAR", subtitle: "Public Filings + Company Financials.", categories: ["finance"], prompt: "Scrape SEC EDGAR 10-K filings from technology companies", icon: Landmark, tint: "bg-slate-500/10 text-slate-700", logoDomain: "sec.gov", credit_cost_per_lead: 1 },

  // ---------- Education ----------
  { id: "coursera", title: "Coursera Courses", subtitle: "Course Catalogs, Instructors, And Ratings.", categories: ["education"], prompt: "Scrape Coursera data science courses with instructors and ratings", icon: GraduationCap, tint: "bg-blue-500/10 text-blue-700", logoDomain: "coursera.org", credit_cost_per_lead: 1 },
  { id: "udemy", title: "Udemy Courses", subtitle: "Course Catalogs + Instructor Contacts.", categories: ["education"], prompt: "Scrape Udemy marketing courses with instructor profiles", icon: GraduationCap, tint: "bg-purple-500/10 text-purple-700", logoDomain: "udemy.com", credit_cost_per_lead: 1 },
  { id: "edx", title: "edX Programs", subtitle: "Programs From Universities Worldwide.", categories: ["education"], prompt: "Scrape edX programs from Harvard and MIT", icon: GraduationCap, tint: "bg-slate-500/10 text-slate-700", logoDomain: "edx.org", credit_cost_per_lead: 1 },

  // ---------- News ----------
  { id: "google-news", title: "Google News", subtitle: "Headlines + Sources By Keyword.", categories: ["news"], prompt: "Scrape Google News for AI startup funding this month", icon: Newspaper, tint: "bg-blue-500/10 text-blue-700", logoDomain: "news.google.com", credit_cost_per_lead: 1 },
  { id: "bing-news", title: "Bing News", subtitle: "News Aggregation By Topic + Region.", categories: ["news"], prompt: "Scrape Bing News for real estate market news in Florida", icon: Newspaper, tint: "bg-blue-500/10 text-blue-600", logoDomain: "bing.com", credit_cost_per_lead: 1 },
  { id: "reuters", title: "Reuters", subtitle: "Global Business + Political News.", categories: ["news"], prompt: "Scrape Reuters technology headlines from the past week", icon: Newspaper, tint: "bg-orange-500/10 text-orange-700", logoDomain: "reuters.com", credit_cost_per_lead: 1 },

  // ---------- Sports ----------
  { id: "espn", title: "ESPN Scores", subtitle: "Scores, Standings, And Team Data.", categories: ["sports"], prompt: "Scrape ESPN NBA team standings and stats", icon: Trophy, tint: "bg-red-500/10 text-red-700", logoDomain: "espn.com", credit_cost_per_lead: 1 },
  { id: "sofascore", title: "Sofascore", subtitle: "Live Scores And Player Stats.", categories: ["sports"], prompt: "Scrape Sofascore Premier League match results and player stats", icon: Trophy, tint: "bg-emerald-500/10 text-emerald-700", logoDomain: "sofascore.com", credit_cost_per_lead: 1 },
  { id: "flashscore", title: "Flashscore", subtitle: "Live Scores Across All Sports.", categories: ["sports"], prompt: "Scrape Flashscore results for soccer leagues this weekend", icon: Trophy, tint: "bg-red-500/10 text-red-600", logoDomain: "flashscore.com", credit_cost_per_lead: 1 },

  // ---------- Assistant default grid additions ----------
  {
    id: "roofers",
    title: "Roofers",
    subtitle: "Find Roofing Companies In Your Area.",
    categories: ["business", "realestate"],
    prompt: "Find roofing companies in Hillsborough County FL with mobile numbers, remove franchises",
    icon: Hammer,
    tint: "bg-orange-500/10 text-orange-600",
    logoDomain: "google.com/maps",
    credit_cost_per_lead: 1,
  },
  {
    id: "contractors",
    title: "Contractors",
    subtitle: "Find General Contractors Near You.",
    categories: ["business", "realestate"],
    prompt: "Find general contractors in Pinellas County FL with mobile numbers, remove franchises",
    icon: Wrench,
    tint: "bg-amber-500/10 text-amber-600",
    logoDomain: "google.com/maps",
    credit_cost_per_lead: 1,
  },
  {
    id: "commercial",
    title: "Commercial Properties",
    subtitle: "Find Commercial Properties For Sale.",
    categories: ["realestate"],
    prompt: "Find commercial properties for sale in Hillsborough County FL and skip trace the owners",
    icon: Building2,
    tint: "bg-blue-500/10 text-blue-600",
    logoDomain: "loopnet.com",
    credit_cost_per_lead: 1,
  },
  {
    id: "property-owners",
    title: "Property Owners",
    subtitle: "Find Property Owners By Criteria.",
    categories: ["records", "realestate"],
    prompt: "Find property owners in Hillsborough County FL matching my criteria and skip trace them",
    icon: Home,
    tint: "bg-emerald-500/10 text-emerald-600",
    credit_cost_per_lead: 0,
  },
  {
    id: "absentee",
    featured: true,
    featuredOrder: 10,
    title: "Absentee Owners",
    subtitle: "Find Absentee And Out-Of-State Owners.",
    categories: ["records", "realestate"],
    prompt: "Find absentee and out-of-state property owners in Pasco County FL and skip trace them",
    icon: MapPin,
    tint: "bg-indigo-500/10 text-indigo-600",
    credit_cost_per_lead: 0,
  },
];
export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  business: "Business & Local",
  directories: "Directories",
  records: "Public Records",
  social: "Social",
  ecommerce: "E-commerce",
  jobs: "Jobs",
  reviews: "Reviews",
  realestate: "Real Estate",
  travel: "Travel",
  finance: "Finance",
  education: "Education",
  news: "News",
  sports: "Sports",
  search: "Search Engine",
  upload: "Upload",
};

/** Curated starter set, ordered by `featuredOrder`. */
export function featuredTemplates(): Template[] {
  return TEMPLATES.filter((t) => t.featured).sort(
    (a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99),
  );
}

/** Look up a template by its id. */
export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Other templates in the same category (excluding the given one). */
export function relatedTemplates(t: Template, limit = 6): Template[] {
  const primary = primaryCategory(t);
  return TEMPLATES.filter((x) => x.id !== t.id && hasCategory(x, primary)).slice(0, limit);
}

/** Fields the pipeline returns for a template's category. */
export function templateFields(t: Template): string[] {
  const base = ["Name", "Phone", "Email", "Website", "Source URL"];
  switch (primaryCategory(t)) {
    case "business":
    case "directories":
      return ["Business Name", "Owner / Contact", "Phone", "Email", "Address", "Category", "Website", "Rating"];
    case "records":
      return ["Owner Name", "Mailing Address", "Property Address", "Filing Date", "Case / Doc Number", "Phone (Traced)"];
    case "realestate":
      return ["Owner Name", "Property Address", "List Price", "Status", "Agent", "Phone", "Email"];
    case "social":
      return ["Handle", "Display Name", "Bio", "Followers", "Link In Bio", "Email", "Phone (Traced)"];
    case "ecommerce":
      return ["Store / Product", "Price", "Seller Name", "Reviews", "Store URL", "Email", "Phone"];
    case "jobs":
      return ["Company", "Job Title", "Location", "Posted Date", "Hiring Contact", "Phone", "Email"];
    case "reviews":
      return ["Business Name", "Rating", "Review Count", "Latest Review", "Phone", "Email"];
    case "upload":
      return ["Your Columns (Mapped)", "Normalized Phone", "Line Type", "DNC Status", "Traced Phone"];
    default:
      return base;
  }
}

/** The Job Spec source a template already determines on its own. */
export function templateSourceType(t: Template): "business" | "records" | "upload" | "street_scan" {
  // Street Scan is its own source kind: parcels + buy box + imagery scoring.
  if (t.id === "street-scan") return "street_scan";
  if (hasCategory(t, "upload")) return "upload";
  if (primaryCategory(t) === "records") return "records";
  return "business";
}
