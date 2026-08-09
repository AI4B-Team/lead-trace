import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Zap } from "lucide-react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/marketing-layout";
import { TemplateCard } from "@/components/marketing/template-card";
import { TemplateLogo } from "@/components/marketing/template-logo";
import { PipelineFunnel } from "@/components/app/pipeline-funnel";
import { Button } from "@/components/ui/button";
import {
import { RouteErrorState, RouteNotFoundState } from "@/components/route-error";
  CATEGORY_LABELS,
  getTemplate,
  primaryCategory,
  relatedTemplates,
  templateFields,
} from "@/lib/templates";

export const Route = createFileRoute("/templates/$templateId")({
  loader: ({ params }) => {
    const template = getTemplate(params.templateId);
    if (!template) throw notFound();
    return { title: template.title, subtitle: template.subtitle };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Template Not Found — LeadTrace" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${loaderData.title} Template — LeadTrace`;
    const description = `${loaderData.subtitle} Run it through the LeadTrace skip trace, scrub, and SMS campaign pipeline.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: TemplateNotFound,
  component: TemplateDetailPage,
  errorComponent: RouteErrorState,
});

const STEPS = [
  { title: "Pull The Source", body: "We collect every matching record from the source with location and keyword filters applied." },
  { title: "Dedupe", body: "Duplicate businesses, franchises, and repeat phone numbers collapse into one clean record." },
  { title: "Skip Trace", body: "Missing mobile numbers are appended so you have a textable contact, not just a listing." },
  { title: "Scrub", body: "DNC, litigator, and landline filtering runs before a single message goes out." },
  { title: "Campaign", body: "Approved leads drop into a warmed SMS campaign with quiet-hour and drip controls." },
];

function TemplateDetailPage() {
  const { templateId } = Route.useParams();
  const template = getTemplate(templateId)!;
  const fields = templateFields(template);
  const related = relatedTemplates(template);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <div className="mx-auto max-w-[68.75rem] px-6 py-14">
          <Link
            to="/templates"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back To Template Library
          </Link>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <TemplateLogo
              template={template}
              className="h-16 w-16 rounded-2xl"
              imgClassName="h-9 w-9"
              iconClassName="h-7 w-7"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[primaryCategory(template)]}
                </span>
                {template.beta ? (
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    Beta
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 font-display text-4xl md:text-5xl font-black text-foreground">
                {template.title}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">{template.subtitle}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/" search={{ template: template.id }}>
                Run This Template <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/app/assistant" search={{ source: "business", niche: template.title }}>
                Open In App
              </Link>
            </Button>
          </div>

          <section className="mt-12 rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-xl font-bold text-foreground">Example Prompt</h2>
            <p className="mt-3 rounded-xl bg-surface-muted p-4 font-mono text-sm text-foreground">
              {template.prompt}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Edit the trade, city, or radius — the pipeline stays the same.
            </p>
          </section>

          <section className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="font-display text-xl font-bold text-foreground">What You Get</h2>
              <ul className="mt-4 space-y-2">
                {fields.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 text-primary shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="font-display text-xl font-bold text-foreground">Typical Yield</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A representative run — raw records narrow down to clean, textable contacts.
              </p>
              <PipelineFunnel
                className="mt-6"
                stages={{ found: 1000, deduped: 820, textable: 610, scrubbed: 540, clean: 505 }}
              />
              <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" /> DNC + litigator scrub on every run
                </p>
                <p className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary shrink-0" /> Credits only charged on clean leads
                </p>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-xl font-bold text-foreground">How This Template Runs</h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-border bg-surface-muted p-4">
                  <span className="font-mono text-xs text-muted-foreground">Step {i + 1}</span>
                  <p className="mt-1 font-display font-bold text-foreground">{s.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </section>

          {related.length > 0 ? (
            <section className="mt-12">
              <h2 className="font-display text-2xl font-bold text-foreground">
                More {CATEGORY_LABELS[primaryCategory(template)]} Templates
              </h2>
              <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {related.map((t) => (
                  <TemplateCard key={t.id} template={t} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

function TemplateNotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1 mx-auto max-w-[43.75rem] px-6 py-24 text-center">
        <h1 className="font-display text-4xl font-black text-foreground">Template Not Found</h1>
        <p className="mt-3 text-muted-foreground">
          That template no longer exists. Browse the full library instead.
        </p>
        <Button asChild className="mt-6">
          <Link to="/templates">Back To Template Library</Link>
        </Button>
      </main>
      <MarketingFooter />
    </div>
  );
}
