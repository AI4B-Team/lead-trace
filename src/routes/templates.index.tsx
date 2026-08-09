import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/marketing-layout";
import { TemplateCard } from "@/components/marketing/template-card";
import { TEMPLATES, hasCategory, type TemplateCategory } from "@/lib/templates";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Filter = "all" | TemplateCategory;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "business", label: "Business" },
  { key: "directories", label: "Directories" },
  { key: "search", label: "Search Engine" },
  { key: "social", label: "Social" },
  { key: "ecommerce", label: "E-commerce" },
  { key: "jobs", label: "Jobs" },
  { key: "reviews", label: "Reviews" },
  { key: "realestate", label: "Real Estate" },
  { key: "travel", label: "Travel" },
  { key: "finance", label: "Finance" },
  { key: "education", label: "Education" },
  { key: "news", label: "News" },
  { key: "sports", label: "Sports" },
  { key: "records", label: "Public Records" },
  { key: "upload", label: "Upload" },
];

/** Shown inline; everything else lives behind the More dropdown. */
const PRIMARY_COUNT = 8;

type Sort = "relevance" | "popular" | "alpha";

const SORTS: { key: Sort; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "popular", label: "Popular" },
  { key: "alpha", label: "Name A–Z" },
];

/** Curated "popular" ordering — the sources people ask for most. */
const POPULAR_IDS = [
  "google-maps", "google-search", "google-local", "contact-details", "yelp",
  "yellow-pages", "linkedin", "instagram-hashtag", "facebook-pages", "bbb",
];

export const Route = createFileRoute("/templates/")({
  head: () => ({
    meta: [
      { title: "Template Library — LeadTrace" },
      { name: "description", content: "Pick a source to start a list. Every LeadTrace template runs the same skip trace, scrub, and campaign pipeline." },
      { property: "og:title", content: "LeadTrace Template Library" },
      { property: "og:description", content: "Browse every scraper, records, and upload template LeadTrace ships." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/templates" }],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("relevance");
  const [betaOnly, setBetaOnly] = useState(false);

  const primary = FILTERS.slice(0, PRIMARY_COUNT);
  const overflow = FILTERS.slice(PRIMARY_COUNT);
  const activeOverflow = overflow.find((f) => f.key === filter);

  let items = filter === "all" ? TEMPLATES : TEMPLATES.filter((t) => hasCategory(t, filter));
  if (betaOnly) items = items.filter((t) => t.beta);
  if (sort === "alpha") {
    items = [...items].sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "popular") {
    const rank = (id: string) => {
      const i = POPULAR_IDS.indexOf(id);
      return i === -1 ? POPULAR_IDS.length : i;
    };
    items = [...items].sort((a, b) => rank(a.id) - rank(b.id));
  }

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-surface text-foreground hover:bg-surface-muted"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <div className="mx-auto max-w-[77.5rem] px-4 sm:px-6 py-10 sm:py-14">
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back To Home
          </Link>
          <h1 className="mt-6 font-display text-4xl md:text-5xl font-black text-foreground">
            Template Library
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground lg:whitespace-nowrap">
            Pick A Source To Start A Job. Every Template Runs The Same Skip Trace, Scrub, And Campaign Pipeline.
          </p>
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
              {primary.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`${pill(filter === f.key)} shrink-0`}
                >
                  {f.label}
                </button>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger className={`${pill(!!activeOverflow)} shrink-0`}>
                  {activeOverflow ? activeOverflow.label : "More"}
                  <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {overflow.map((f) => (
                    <DropdownMenuItem key={f.key} onClick={() => setFilter(f.key)}>
                      <span className="flex-1">{f.label}</span>
                      {filter === f.key && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className={`${pill(false)} shrink-0`}>
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {SORTS.find((s) => s.key === sort)?.label}
                </span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {SORTS.map((s) => (
                  <DropdownMenuItem key={s.key} onClick={() => setSort(s.key)}>
                    <span className="flex-1">{s.label}</span>
                    {sort === s.key && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setBetaOnly((b) => !b)}>
                  <span className="flex-1">Beta Templates Only</span>
                  {betaOnly && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}