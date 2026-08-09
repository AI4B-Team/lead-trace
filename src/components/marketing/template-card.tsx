import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { templateCostBadge, type Template } from "@/lib/templates";
import { TemplateLogo } from "@/components/marketing/template-logo";
import {
  HEALTH_DOT,
  HEALTH_LABEL,
  unavailableMessage,
  type HealthStatus,
} from "@/lib/template-health.shared";

/**
 * Source health dot. Absent health data means "never checked" — we show
 * nothing rather than implying a green light we haven't verified.
 */
export function TemplateHealthDot({ status }: { status?: HealthStatus | null }) {
  if (!status) return null;
  return (
    <span
      title={HEALTH_LABEL[status]}
      aria-label={HEALTH_LABEL[status]}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[status]}`}
    />
  );
}

/**
 * What this source draws from the plan's single credit pool — never an extra
 * charge. 0-cost sources render as "Free".
 */
export function TemplateCostBadge({ template }: { template: Template }) {
  const { free, label } = templateCostBadge(template);
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[0.625rem] font-semibold ${
        free
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-surface-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

export function TemplateCard({
  template,
  /**
   * "detail" opens the template's page; "prompt" selects the template as
   * context for the homepage prompt hero (never inserting its text);
   * "insert" is an in-app button that hands the template back via onSelect.
   */
  variant = "detail",
  onSelect,
  selected = false,
  compact = false,
  large = false,
  health,
  healthEta,
  comingSoon = false,
}: {
  template: Template;
  variant?: "detail" | "prompt" | "insert";
  onSelect?: (template: Template) => void;
  /** Persistent selected state for the "insert" and "prompt" variants. */
  selected?: boolean;
  /** Uses the template's short two-line labels for dense grids. */
  compact?: boolean;
  /** Roomier hero-grid presentation: bigger logo, title and padding. */
  large?: boolean;
  /** Live source health. `broken` disables selection with an honest message. */
  health?: HealthStatus | null;
  /** Operator-supplied "expected back" note shown on broken sources. */
  healthEta?: string | null;
  /**
   * No verified county/record-type pair exists for this template yet. Coverage
   * is the source of truth, so the card can't be run — it invites a request.
   */
  comingSoon?: boolean;
}) {
  const broken = health === "broken" || comingSoon;
  const className =
    `group relative flex min-w-0 items-center ${large ? "gap-3 sm:gap-4" : "gap-3"} rounded-2xl border ${compact ? "p-3" : large ? "p-4 sm:p-5" : "p-4"} transition text-left w-full ${
      broken ? "cursor-not-allowed opacity-60" : "hover:border-primary hover:shadow-sm"
    } ${
      selected ? "border-primary bg-primary/5" : "border-border bg-surface"
    }`;
  const title = compact ? template.shortTitle ?? template.title : template.title;
  const subtitle = compact ? template.shortSubtitle ?? template.subtitle : template.subtitle;
  const body = (
    <>
      {selected ? (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
      <TemplateLogo
        template={template}
        className={large ? "h-14 w-14" : undefined}
        iconClassName={large ? "h-6 w-6" : undefined}
        imgClassName={large ? "h-8 w-8" : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <TemplateHealthDot status={health} />
          <span
            className={`min-w-0 font-display font-bold text-foreground truncate ${compact ? "text-sm" : large ? "text-lg" : ""}`}
          >
            {title}
          </span>
          {comingSoon ? (
            <span className="shrink-0 rounded-full border border-border bg-surface-muted px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Coming Soon
            </span>
          ) : template.beta ? (
            <span className="shrink-0 rounded-full border border-border bg-surface-muted px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Beta
            </span>
          ) : null}
        </span>
        <span
          className={`block text-muted-foreground mt-0.5 truncate ${large ? "text-sm" : "text-xs"}`}
        >
          {subtitle}
        </span>
        {comingSoon ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            No verified county yet — request it and we'll add it.
          </span>
        ) : health && health !== "healthy" ? (
          <span
            className={`mt-1 block text-xs ${broken ? "text-destructive" : "text-warning"}`}
          >
            {unavailableMessage(health, healthEta)}
          </span>
        ) : null}
        <span className="mt-1.5 flex items-center gap-2">
          {!comingSoon && <TemplateCostBadge template={template} />}
        </span>
      </span>
    </>
  );

  if (variant === "insert" || variant === "prompt") {
    return (
      <button
        type="button"
        aria-pressed={selected}
        disabled={broken}
        onClick={() => onSelect?.(template)}
        className={className}
      >
        {body}
      </button>
    );
  }

  const linkProps = {
    to: "/templates/$templateId",
    params: { templateId: template.id },
  } as const;
  return (
    <Link {...linkProps} className={className}>
      {body}
    </Link>
  );
}