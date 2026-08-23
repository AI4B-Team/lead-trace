import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { TemplateCard } from "@/components/marketing/template-card";
import { useTemplateCoverage } from "@/hooks/use-template-coverage";
import { TEMPLATES, hasCategory, type Template, type TemplateCategory } from "@/lib/templates";
import { touchRecentTemplate } from "@/lib/recent-templates";
import { useWorkspaceId } from "@/hooks/use-workspace";
import { useTemplateHealth } from "@/hooks/use-template-health";
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
  { key: "marketplace", label: "Marketplace" },
  { key: "records", label: "Public Records" },
  { key: "upload", label: "Upload" },
];

const PRIMARY_COUNT = 8;

type Sort = "relevance" | "popular" | "alpha";

const SORTS: { key: Sort; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "popular", label: "Popular" },
  { key: "alpha", label: "Name A–Z" },
];

const POPULAR_IDS = [
  "gmaps", "gserp", "glocal", "contact-details", "yelp",
  "yellow-pages", "linkedin", "instagram-hashtag", "facebook-pages", "bbb",
];

export const Route = createFileRoute("/_authenticated/app/templates")({
  head: () => ({
    meta: [
      { title: "Template Library — LeadTrace App" },
      { name: "description", content: "Browse every LeadTrace source template and send it straight to the AI Assistant as a ready-to-edit prompt." },
      { property: "og:title", content: "Template Library — LeadTrace App" },
      { property: "og:description", content: "Pick a source template and the assistant drafts the list for you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppTemplates,
});

function AppTemplates() {
  const navigate = useNavigate();
  const { workspaceId } = useWorkspaceId();
  const { health } = useTemplateHealth();
  const { isComingSoon } = useTemplateCoverage();
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

  /** In-app selection hands the template prompt to the assistant composer. */
  function handleSelect(t: Template) {
    if (workspaceId) touchRecentTemplate(workspaceId, t.id);
    navigate({ to: "/app/assistant", search: { template: t.id } });
  }

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-surface text-foreground hover:bg-surface-muted"
    }`;

  return (
    <div>
      <PageHeader
        title="Template Library"
        description="Pick A Source To Start A List. Selecting A Template Drops Its Prompt Into The AI Assistant."
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
          {primary.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`${pill(filter === f.key)} shrink-0`}>
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
            <span className="hidden sm:inline">{SORTS.find((s) => s.key === sort)?.label}</span>
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

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            variant="insert"
            health={health[t.id]?.status ?? null}
            healthEta={health[t.id]?.eta ?? null}
            comingSoon={isComingSoon(t)}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {items.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">No Templates Match These Filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another category, or clear the beta-only filter.
          </p>
          <button
            onClick={() => {
              setFilter("all");
              setBetaOnly(false);
            }}
            className="mt-4 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
