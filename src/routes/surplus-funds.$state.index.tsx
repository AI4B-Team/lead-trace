import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { stateCodeFromSlug } from "@/lib/surplus/slug";

/**
 * Friendly entry point (`/surplus-funds/florida`) onto the single canonical
 * surplus state guide. Redirecting rather than re-rendering keeps one
 * implementation and one indexable URL per state.
 */
export const Route = createFileRoute("/surplus-funds/$state/")({
  beforeLoad: ({ params }) => {
    const code = stateCodeFromSlug(params.state);
    if (!code) throw notFound();
    throw redirect({
      to: "/distress-feed/states/$state/surplus-funds",
      params: { state: code.toLowerCase() },
    });
  },
});