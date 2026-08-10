import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  descriptionClassName,
  actions,
}: {
  title: string;
  description?: string;
  descriptionClassName?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">{title}</h1>
        {description && (
          <p className={`text-sm text-muted-foreground mt-1 max-w-2xl ${descriptionClassName ?? ""}`}>{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}