import type { ReactNode } from "react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";

/** Placeholder company details — replace before launch. */
export const LEGAL_ENTITY = "[Company Legal Name]";
export const LEGAL_ADDRESS = "[Company Mailing Address]";
export const LEGAL_EMAIL = "support@leadtrace.app";
export const LEGAL_UPDATED = "October 3, 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-6 py-16 text-foreground">
        <h1 className="font-display text-4xl font-black">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last Updated: {LEGAL_UPDATED}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
          {children}
        </div>
      </article>
    </MarketingLayout>
  );
}
